import { NextResponse, type NextRequest } from "next/server"
import { getCredentialById, deleteCredential } from "@/lib/db/credentials"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/credentials/[id] - Get credential details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const credential = await getCredentialById(id)
    
    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    }
    
    return NextResponse.json({ credential })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/admin/credentials/[id] - Delete credential
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const success = await deleteCredential(id)
    
    if (!success) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}