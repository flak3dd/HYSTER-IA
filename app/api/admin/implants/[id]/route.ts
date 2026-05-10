import { NextResponse, type NextRequest } from "next/server"
import { getImplantById, updateImplant, deleteImplant, listImplantTasks } from "@/lib/db/implants"
import { addTask } from "@/app/api/dpanel/implant/tasks/route"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/implants/[id] - Get a specific implant
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const implant = await getImplantById(id)
    if (!implant) {
      return NextResponse.json({ error: "Implant not found" }, { status: 404 })
    }

    // Get recent tasks for this implant
    const tasks = await listImplantTasks(implant.implantId, undefined)

    return NextResponse.json({ 
      implant,
      tasks
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// PATCH /api/admin/implants/[id] - Update an implant
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const body = await req.json()
    const implant = await updateImplant(id, body)
    if (!implant) {
      return NextResponse.json({ error: "Implant not found" }, { status: 404 })
    }

    return NextResponse.json(implant)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/admin/implants/[id] - Delete an implant
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const success = await deleteImplant(id)
    if (!success) {
      return NextResponse.json({ error: "Implant not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST /api/admin/implants/[id]/tasks - Send a task to an implant
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const implant = await getImplantById(id)
    if (!implant) {
      return NextResponse.json({ error: "Implant not found" }, { status: 404 })
    }

    const body = await req.json()
    const { type, args } = body

    if (!type || !args) {
      return NextResponse.json({ error: "type and args are required" }, { status: 400 })
    }

    const taskId = await addTask(implant.implantId, type, args, body.createdById)

    return NextResponse.json({ 
      message: "Task queued",
      taskId
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}