import { NextResponse, type NextRequest } from "next/server"
import { getPayloadBuildById, updatePayloadBuild, deletePayloadBuild } from "@/lib/db/payload-builds"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/payloads/[id] - Get a specific payload build
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const build = await getPayloadBuildById(id)
    if (!build) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json(build)
  } catch (error) {
    console.error('Get payload build error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/admin/payloads/[id] - Update a payload build
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const body = await req.json()
    const build = await updatePayloadBuild(id, body)
    if (!build) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json(build)
  } catch (error) {
    console.error('Update payload build error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/admin/payloads/[id] - Delete a payload build
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const success = await deletePayloadBuild(id)
    if (!success) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete payload build error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}