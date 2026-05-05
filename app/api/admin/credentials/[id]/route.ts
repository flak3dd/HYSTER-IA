import { NextResponse, type NextRequest } from "next/server"
import { getCredentialById, deleteCredential } from "@/lib/db/credentials"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/credentials/[id] - Get credential details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const credential = await getCredentialById(id)
    
    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    }
    
    return NextResponse.json({ credential })
  } catch (error) {
    console.error("Get credential error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/admin/credentials/[id] - Delete credential
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const success = await deleteCredential(id)
    
    if (!success) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete credential error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}