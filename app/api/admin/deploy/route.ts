import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { DeploymentConfig } from "@/lib/deploy/types"
import { startDeployment, listDeployments } from "@/lib/deploy/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Simple in-memory danger mode settings (shared with tool-executor)
let dangerModeSettings = {
  disableAIGuardRails: false,
  bypassDeploymentApprovals: false,
};

// Function to update danger mode settings (called by settings page)
export function setDangerModeSettings(settings: typeof dangerModeSettings) {
  dangerModeSettings = settings;
}

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
    
    // Check if deployment approval bypass is enabled
    if (!dangerModeSettings.bypassDeploymentApprovals) {
      // In a real implementation, you would check for pending approvals here
      // For now, we'll just add a log entry when approval is required
      console.log('[Deployment] Approval required for deployment (danger mode disabled)');
    }
    
    const body = await req.json().catch(() => null)
    const parsed = DeploymentConfig.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    
    const deployment = await startDeployment(parsed.data)
    
    return NextResponse.json({ 
      deployment, 
      approvalBypassed: dangerModeSettings.bypassDeploymentApprovals 
    }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
