import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { NodeCreate } from "@/lib/db/schema"
import { createNode, listNodes } from "@/lib/db/nodes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const nodes = await listNodes()
    return NextResponse.json({ nodes })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    const parsed = NodeCreate.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    const node = await createNode(parsed.data)
    return NextResponse.json({ node }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
