import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/auth/admin"
import { EgressManager } from "@/lib/infrastructure/egress-manager"

// Global egress manager instance
let egressManager: EgressManager | null = null

function getEgressManager(): EgressManager {
  if (!egressManager) {
    egressManager = new EgressManager({
      healthCheckInterval: 30000, // 30 seconds
      healthCheckTimeout: 5000,   // 5 seconds
      maxRetries: 3,
      rotationStrategy: "least-latency",
      geographicPreferences: ["US-East", "EU-West", "Asia-Pacific"],
      bannedProviders: [],
      loadBalancing: true
    })
  }
  return egressManager
}

// GET /api/admin/infrastructure/egress - List all egress nodes
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const manager = getEgressManager()
    const nodes = manager.getAllNodes()
    const stats = manager.getStatistics()

    return NextResponse.json({
      nodes,
      statistics: stats,
      timestamp: Date.now()
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch egress nodes" },
      { status: 500 }
    )
  }
}

// POST /api/admin/infrastructure/egress - Add new egress node
export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const body = await request.json()
    const manager = getEgressManager()

    const nodeData = {
      name: body.name,
      hostname: body.hostname,
      port: body.port,
      protocol: body.protocol || "socks5",
      region: body.region,
      provider: body.provider,
      bandwidth: body.bandwidth,
      tags: body.tags || [],
      priority: body.priority || 5,
      maxConcurrent: body.maxConcurrent || 100,
      status: "online" as const,
      lastHealthCheck: Date.now(),
      latency: 0,
      successRate: 100,
      activeConnections: 0,
      totalConnections: 0,
      totalRequests: 0,
      failedRequests: 0,
      currentLoad: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const node = manager.addNode(nodeData)
    
    return NextResponse.json({
      success: true,
      node,
      message: "Egress node added successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add egress node" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/infrastructure/egress - Update egress node configuration
export async function PUT(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const body = await request.json()
    const manager = getEgressManager()

    const { nodeId, updates } = body
    if (!nodeId) {
      return NextResponse.json({ error: "Node ID is required" }, { status: 400 })
    }

    const updatedNode = manager.updateNode(nodeId, updates)
    if (!updatedNode) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      node: updatedNode,
      message: "Egress node updated successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update egress node" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/infrastructure/egress - Remove egress node
export async function DELETE(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get("nodeId")

    if (!nodeId) {
      return NextResponse.json({ error: "Node ID is required" }, { status: 400 })
    }

    const manager = getEgressManager()
    const success = manager.removeNode(nodeId)

    if (!success) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Egress node removed successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove egress node" },
      { status: 500 }
    )
  }
}