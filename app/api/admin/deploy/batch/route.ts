import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { startDeployment, listDeployments } from "@/lib/deploy/orchestrator"
import { DeploymentConfig } from "@/lib/deploy/types"
import { serverEnv } from "@/lib/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Batch deployment configuration for 5 hysteria2 nodes
// 3 nodes in westeurope, 2 nodes in australiaeast
const BATCH_CONFIG = {
  // Primary and fallback sizes for Azure capacity issues
  sizes: ["Standard_B1s", "Standard_B1ms", "Standard_B2s", "Standard_D2pls_v5"],
  // 3 nodes in westeurope, 2 nodes in australiaeast
  nodes: [
    { region: "westeurope", resourceGroup: "hysteria-rg-westeurope", nameSuffix: "we-01" },
    { region: "westeurope", resourceGroup: "hysteria-rg-westeurope", nameSuffix: "we-02" },
    { region: "westeurope", resourceGroup: "hysteria-rg-westeurope", nameSuffix: "we-03" },
    { region: "australiaeast", resourceGroup: "hysteria-rg-australiaeast", nameSuffix: "au-01" },
    { region: "australiaeast", resourceGroup: "hysteria-rg-australiaeast", nameSuffix: "au-02" },
  ],
  provider: "azure",
  port: 443,
  tags: ["c2", "auto-deployed", "hysteria2", "active"],
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const env = serverEnv()
    const existingDeployments = listDeployments()
    const activeCount = existingDeployments.filter(d => d.status === "running" || d.status === "pending").length
    
    if (activeCount > 0) {
      return NextResponse.json(
        { error: "Deployments in progress", message: `Wait for ${activeCount} active deployment(s) to complete` },
        { status: 409 }
      )
    }

    const results: Array<{
      region: string
      size: string
      deploymentId: string
      status: "started" | "failed"
      error?: string
    }> = []

    // Deploy 5 nodes: 3 in westeurope, 2 in australiaeast
    for (const nodeConfig of BATCH_CONFIG.nodes) {
      const size = BATCH_CONFIG.sizes[0] // Try B1s first
      const name = `hysteria-${nodeConfig.nameSuffix}-${Date.now()}`
      
      try {
        const config: DeploymentConfig = {
          provider: BATCH_CONFIG.provider,
          region: nodeConfig.region,
          size: size,
          name: name,
          port: BATCH_CONFIG.port,
          tags: BATCH_CONFIG.tags,
          resourceGroup: nodeConfig.resourceGroup,
          // Obfuscated preset with strong password
          obfsPassword: generateStrongPassword(32),
          // Panel URL for auth backend
          panelUrl: env.NEXT_PUBLIC_APP_URL,
        }

        const deployment = await startDeployment(config)
        
        results.push({
          region: nodeConfig.region,
          size: size,
          deploymentId: deployment.id,
          status: "started",
        })
      } catch (err) {
        // Try fallback sizes if B1s fails
        let deployed = false
        for (let sizeIdx = 1; sizeIdx < BATCH_CONFIG.sizes.length && !deployed; sizeIdx++) {
          try {
            const fallbackSize = BATCH_CONFIG.sizes[sizeIdx]
            const fallbackConfig: DeploymentConfig = {
              provider: BATCH_CONFIG.provider,
              region: nodeConfig.region,
              size: fallbackSize,
              name: `${name}-fb${sizeIdx}`,
              port: BATCH_CONFIG.port,
              tags: [...BATCH_CONFIG.tags, "fallback-size"],
              resourceGroup: nodeConfig.resourceGroup,
              obfsPassword: generateStrongPassword(32),
              panelUrl: env.NEXT_PUBLIC_APP_URL,
            }
            
            const deployment = await startDeployment(fallbackConfig)
            results.push({
              region: nodeConfig.region,
              size: fallbackSize,
              deploymentId: deployment.id,
              status: "started",
            })
            deployed = true
          } catch (fallbackErr) {
            continue
          }
        }
        
        if (!deployed) {
          results.push({
            region: nodeConfig.region,
            size: size,
            deploymentId: "",
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Started ${results.filter(r => r.status === "started").length} of 5 deployments`,
      results,
    }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

function generateStrongPassword(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const deployments = listDeployments()
    const batchDeployments = deployments.filter(d => d.config.tags?.includes("auto-deployed"))
    return NextResponse.json({ deployments: batchDeployments })
  } catch (err) {
    return toErrorResponse(err)
  }
}
