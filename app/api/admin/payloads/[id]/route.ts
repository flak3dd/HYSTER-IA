import { NextResponse, type NextRequest } from "next/server"
import { getPayloadBuildById, updatePayloadBuild, deletePayloadBuild } from "@/lib/db/payload-builds"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/payloads/[id] - Get a specific payload build
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const build = await getPayloadBuildById(id)
    if (!build) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json(build)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// PATCH /api/admin/payloads/[id] - Update a payload build
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const body = await req.json()
    const build = await updatePayloadBuild(id, body)
    if (!build) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json(build)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/admin/payloads/[id] - Delete a payload build
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const success = await deletePayloadBuild(id)
    if (!success) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}