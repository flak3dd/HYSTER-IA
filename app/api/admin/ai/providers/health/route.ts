import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getProviderHealthStatus, getDetailedProviderStatus, getAvailableProviders } from "@/lib/ai/provider-fallback"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    // Get basic health status for all providers
    const healthStatus = await getProviderHealthStatus()
    
    // Get available providers list
    const availableProviders = getAvailableProviders()
    
    // Get detailed status for each provider
    const detailedStatus: Record<string, any> = {}
    for (const provider of availableProviders) {
      const details = getDetailedProviderStatus(provider.name)
      if (details) {
        detailedStatus[provider.name] = {
          model: provider.model,
          priority: provider.priority,
          enabled: provider.isEnabled,
          health: details.health?.status,
          circuitBreaker: details.circuitBreaker.state,
          available: details.available,
          error: details.health?.error,
          totalCalls: details.circuitBreaker.totalCalls,
          failureRate: details.circuitBreaker.totalCalls > 0 
            ? ((details.circuitBreaker.failures / details.circuitBreaker.totalCalls) * 100).toFixed(2) + '%'
            : '0%',
          lastFailure: details.circuitBreaker.lastFailureTime
            ? new Date(details.circuitBreaker.lastFailureTime).toISOString()
            : null,
        }
      } else {
        detailedStatus[provider.name] = {
          model: provider.model,
          priority: provider.priority,
          enabled: provider.isEnabled,
          health: 'unknown',
          circuitBreaker: 'closed',
          available: true,
          error: null,
          totalCalls: 0,
          failureRate: '0%',
          lastFailure: null,
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      providers: detailedStatus,
      summary: {
        total: availableProviders.length,
        healthy: Object.values(healthStatus).filter(h => h.healthy).length,
        unhealthy: Object.values(healthStatus).filter(h => !h.healthy).length,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
