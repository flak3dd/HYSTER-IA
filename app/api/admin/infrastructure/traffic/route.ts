import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/auth/admin"
import { TrafficRouter } from "@/lib/infrastructure/traffic-router"

// Global traffic router instance
let trafficRouter: TrafficRouter | null = null

function getTrafficRouter(): TrafficRouter {
  if (!trafficRouter) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EgressManager } = require("@/lib/infrastructure/egress-manager")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DomainFrontingManager } = require("@/lib/infrastructure/domain-fronting")
    
    const egressManager = new EgressManager({
      healthCheckInterval: 30000,
      healthCheckTimeout: 5000,
      maxRetries: 3,
      rotationStrategy: "least-latency",
      geographicPreferences: ["US-East", "EU-West", "Asia-Pacific"],
      bannedProviders: [],
      loadBalancing: true
    })
    
    const frontingManager = new DomainFrontingManager()
    
    trafficRouter = new TrafficRouter({
      defaultStrategy: "redirector",
      enableFailover: true,
      enableLoadBalancing: true,
      geographicRouting: true,
      maxHops: 3,
      healthCheckInterval: 30000,
      circuitBreakerThreshold: 5
    }, egressManager, frontingManager)
  }
  return trafficRouter
}

// GET /api/admin/infrastructure/traffic - Get traffic routing status and routes
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const router = getTrafficRouter()
    const routes = router.getAllRoutes()
    const stats = router.getStatistics()

    return NextResponse.json({
      routes,
      statistics: stats,
      timestamp: Date.now()
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch traffic routes" },
      { status: 500 }
    )
  }
}

// POST /api/admin/infrastructure/traffic/route - Route traffic through infrastructure
export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const body = await request.json()
    const router = getTrafficRouter()

    const { type, destination, source } = body
    
    if (!type || !destination) {
      return NextResponse.json(
        { error: "Traffic type and destination are required" },
        { status: 400 }
      )
    }

    const route = await router.routeTraffic(type, destination, source)
    
    if (!route) {
      return NextResponse.json(
        { error: "No route available for this traffic" },
        { status: 503 }
      )
    }

    return NextResponse.json({
      success: true,
      route,
      message: "Traffic route created successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to route traffic" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/infrastructure/traffic/record - Record route result for circuit breaker
export async function PUT(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const body = await request.json()
    const router = getTrafficRouter()

    const { routeId, success } = body
    
    if (!routeId || typeof success !== "boolean") {
      return NextResponse.json(
        { error: "Route ID and success status are required" },
        { status: 400 }
      )
    }

    router.recordRouteResult(routeId, success)
    
    return NextResponse.json({
      success: true,
      message: "Route result recorded successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record route result" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/infrastructure/traffic/cleanup - Clean up old routes
export async function DELETE(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const { searchParams } = new URL(request.url)
    const maxAge = searchParams.get("maxAge")

    const router = getTrafficRouter()
    router.cleanup(maxAge ? parseInt(maxAge) : undefined)

    return NextResponse.json({
      success: true,
      message: "Old routes cleaned up successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cleanup routes" },
      { status: 500 }
    )
  }
}