import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Simple in-memory storage for danger mode settings
// In production, you might want to store this in a database or Redis
let dangerModeSettings = {
  disableAIGuardRails: false,
  bypassDeploymentApprovals: false,
}

// Sync with tool-executor
const { setDangerModeSettings: setToolExecutorDangerMode } = await import("@/lib/grok/tool-executor")
// Sync with deployment route  
const { setDangerModeSettings: setDeploymentDangerMode } = await import("@/app/api/admin/deploy/route")

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    return NextResponse.json({ settings: dangerModeSettings })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    
    dangerModeSettings = {
      disableAIGuardRails: !!body.disableAIGuardRails,
      bypassDeploymentApprovals: !!body.bypassDeploymentApprovals,
    }
    
    // Sync with other modules
    setToolExecutorDangerMode(dangerModeSettings)
    setDeploymentDangerMode(dangerModeSettings)
    
    return NextResponse.json({ 
      success: true, 
      settings: dangerModeSettings 
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}