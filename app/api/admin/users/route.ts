import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { ClientUserCreate } from "@/lib/db/schema"
import { createUser, listUsers } from "@/lib/db/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const users = await listUsers()
    return NextResponse.json({ users })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    const parsed = ClientUserCreate.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    const user = await createUser(parsed.data)
    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
