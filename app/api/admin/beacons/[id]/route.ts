import { NextResponse, type NextRequest } from "next/server"
import { getBeaconById, updateBeacon, deleteBeacon } from "@/lib/db/beacons"
import { BeaconUpdate } from "@/lib/db/schema"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/beacons/[id] - Get beacon details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const beacon = await getBeaconById(id)
    
    if (!beacon) {
      return NextResponse.json({ error: "Beacon not found" }, { status: 404 })
    }
    
    return NextResponse.json({ beacon })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// PATCH /api/admin/beacons/[id] - Update beacon
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const body = await req.json()
    const parsed = BeaconUpdate.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "bad_request", issues: parsed.error.issues },
        { status: 400 }
      )
    }
    
    const beacon = await updateBeacon(id, parsed.data)
    
    if (!beacon) {
      return NextResponse.json({ error: "Beacon not found" }, { status: 404 })
    }
    
    return NextResponse.json({ beacon })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/admin/beacons/[id] - Delete beacon
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const success = await deleteBeacon(id)
    
    if (!success) {
      return NextResponse.json({ error: "Beacon not found" }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}