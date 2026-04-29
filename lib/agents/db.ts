import { prisma } from "@/lib/db"
import type { AgentTask as PrismaTask, AgentStep as PrismaStep } from "@prisma/client"
import { AgentStep, AgentTask, type AgentTaskStatus } from "@/lib/agents/types"

function toTaskZod(row: PrismaTask): AgentTask {
  return {
    id: row.id,
    status: row.status as AgentTask["status"],
    prompt: row.prompt,
    model: row.model,
    allowedTools: JSON.parse(row.allowedTools) as string[],
    maxSteps: row.maxSteps,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    result: row.result,
    error: row.error,
    stepCount: row.stepCount,
  }
}

function toStepZod(row: PrismaStep): AgentStep {
  return {
    index: row.index,
    kind: row.kind as AgentStep["kind"],
    at: row.at.toISOString(),
    content: row.content,
    tool: row.tool,
    arguments: row.arguments ?? undefined,
    result: row.result ?? undefined,
  }
}

export async function createTaskRow(task: AgentTask): Promise<void> {
  await prisma.agentTask.create({
    data: {
      id: task.id,
      status: task.status,
      prompt: task.prompt,
      model: task.model,
      allowedTools: JSON.stringify(task.allowedTools),
      maxSteps: task.maxSteps,
      createdAt: new Date(task.createdAt),
      finishedAt: task.finishedAt ? new Date(task.finishedAt) : null,
      createdBy: task.createdBy,
      result: task.result,
      error: task.error,
      stepCount: task.stepCount,
    },
  })
}

export async function updateTaskRow(
  id: string,
  patch: Partial<AgentTask>,
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.status !== undefined) data.status = patch.status
  if (patch.result !== undefined) data.result = patch.result
  if (patch.error !== undefined) data.error = patch.error
  if (patch.stepCount !== undefined) data.stepCount = patch.stepCount
  if (patch.finishedAt !== undefined) {
    data.finishedAt = patch.finishedAt ? new Date(patch.finishedAt) : null
  }

  await prisma.agentTask.update({ where: { id }, data })
}

export async function getTaskRow(id: string): Promise<AgentTask | null> {
  const row = await prisma.agentTask.findUnique({ where: { id } })
  return row ? toTaskZod(row) : null
}

export async function listTaskRows(limit = 50): Promise<AgentTask[]> {
  const rows = await prisma.agentTask.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return rows.map(toTaskZod)
}

export async function appendStepRow(
  taskId: string,
  step: AgentStep,
): Promise<void> {
  await prisma.agentStep.create({
    data: {
      taskId,
      index: step.index,
      kind: step.kind,
      at: new Date(step.at),
      content: step.content,
      tool: step.tool,
      arguments: step.arguments as object | undefined,
      result: step.result as object | undefined,
    },
  })
}

export async function listStepRows(taskId: string): Promise<AgentStep[]> {
  const rows = await prisma.agentStep.findMany({
    where: { taskId },
    orderBy: { index: "asc" },
  })
  return rows.map(toStepZod)
}

export async function markTerminal(
  id: string,
  status: Extract<AgentTaskStatus, "succeeded" | "failed" | "cancelled">,
  patch: Partial<AgentTask> = {},
): Promise<void> {
  await updateTaskRow(id, { ...patch, status, finishedAt: new Date().toISOString() })
}
