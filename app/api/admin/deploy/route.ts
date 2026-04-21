import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { DeploymentConfig } from "@/lib/deploy/types"
import { startDeployment, listDeployments } from "@/lib/deploy/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const deployments = listDeployments()
    return NextResponse.json({ deployments })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    const parsed = DeploymentConfig.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    const deployment = await startDeployment(parsed.data)
    return NextResponse.json({ deployment }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
