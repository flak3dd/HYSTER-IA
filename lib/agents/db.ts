import { adminFirestore as adminDb } from "@/lib/firebase/admin"
import { AgentStep, AgentTask, type AgentTaskStatus } from "@/lib/agents/types"

const TASKS = "agentTasks"
const STEPS = "agentTaskSteps"

function nowIso(): string {
  return new Date().toISOString()
}

export async function createTaskRow(task: AgentTask): Promise<void> {
  await adminDb().collection(TASKS).doc(task.id).set(task)
}

export async function updateTaskRow(
  id: string,
  patch: Partial<AgentTask>,
): Promise<void> {
  await adminDb()
    .collection(TASKS)
    .doc(id)
    .set({ ...patch, updatedAt: nowIso() }, { merge: true })
}

export async function getTaskRow(id: string): Promise<AgentTask | null> {
  const snap = await adminDb().collection(TASKS).doc(id).get()
  if (!snap.exists) return null
  return AgentTask.parse(snap.data())
}

export async function listTaskRows(limit = 50): Promise<AgentTask[]> {
  const snap = await adminDb()
    .collection(TASKS)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => AgentTask.parse(d.data()))
}

export async function appendStepRow(
  taskId: string,
  step: AgentStep,
): Promise<void> {
  await adminDb()
    .collection(TASKS)
    .doc(taskId)
    .collection(STEPS)
    .doc(String(step.index).padStart(4, "0"))
    .set(step)
}

export async function listStepRows(taskId: string): Promise<AgentStep[]> {
  const snap = await adminDb()
    .collection(TASKS)
    .doc(taskId)
    .collection(STEPS)
    .orderBy("index", "asc")
    .get()
  return snap.docs.map((d) => AgentStep.parse(d.data()))
}

export async function markTerminal(
  id: string,
  status: Extract<AgentTaskStatus, "succeeded" | "failed" | "cancelled">,
  patch: Partial<AgentTask> = {},
): Promise<void> {
  await updateTaskRow(id, { ...patch, status, finishedAt: nowIso() })
}
