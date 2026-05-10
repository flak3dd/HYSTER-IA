import { NextResponse, type NextRequest } from "next/server"
import { getLateralMovementById, updateLateralMovementStatus } from "@/lib/db/lateral-movement"
import { MovementStatus } from "@/lib/db/schema"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import logger from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const log = logger.child({ module: "api/admin/lateral-movement/[id]" })

// GET /api/admin/lateral-movement/[id] - Get lateral movement details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
  } catch (error) {
    return toErrorResponse(error)
  }

  try {
    const { id } = await params
    const movement = await getLateralMovementById(id)
    
    if (!movement) {
      return NextResponse.json({ error: "Lateral movement not found" }, { status: 404 })
    }
    
    return NextResponse.json({ movement })
  } catch (error) {
    log.error({ err: error }, "Get lateral movement error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/admin/lateral-movement/[id] - Update lateral movement status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
  } catch (error) {
    return toErrorResponse(error)
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { status, errorMessage } = body
    
    if (!status || !["pending", "executing", "success", "failed", "blocked"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    
    const movement = await updateLateralMovementStatus(
      id,
      status as MovementStatus,
      errorMessage
    )
    
    if (!movement) {
      return NextResponse.json({ error: "Lateral movement not found" }, { status: 404 })
    }
    
    return NextResponse.json({ movement })
  } catch (error) {
    log.error({ err: error }, "Update lateral movement error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}