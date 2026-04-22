import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getProfileById, updateProfile, deleteProfile, ProfileUpdate } from "@/lib/db/profiles"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const profile = await getProfileById(id)
    if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ profile })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const body = await req.json().catch(() => null)
    const parsed = ProfileUpdate.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    const profile = await updateProfile(id, parsed.data)
    if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ profile })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const ok = await deleteProfile(id)
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
