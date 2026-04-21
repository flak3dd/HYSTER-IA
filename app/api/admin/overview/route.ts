import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getStatus } from "@/lib/hysteria/manager"
import { listNodes } from "@/lib/db/nodes"
import { listUsers } from "@/lib/db/users"
import { fetchOnline, fetchTraffic } from "@/lib/hysteria/traffic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const [status, nodes, users, onlineResult, trafficResult] = await Promise.all([
      Promise.resolve(getStatus()),
      listNodes().catch(() => []),
      listUsers().catch(() => []),
      fetchOnline().catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
      fetchTraffic(false).catch(() => null),
    ])

    const activeNodeCount = nodes.filter((n) => n.status === "running").length
    const usersByAuthToken = new Map(users.map((u) => [u.authToken, u]))

    const online =
      onlineResult && typeof onlineResult === "object" && "error" in onlineResult
        ? { available: false, error: onlineResult.error as string, count: 0, clients: [] }
        : {
            available: true,
            count: Object.values(onlineResult as Record<string, number>).reduce(
              (acc, n) => acc + (n ?? 0),
              0,
            ),
            clients: Object.entries(onlineResult as Record<string, number>).map(
              ([authToken, count]) => {
                const u = usersByAuthToken.get(authToken)
                return {
                  authTokenSuffix: authToken.slice(-6),
                  userId: u?.id ?? null,
                  displayName: u?.displayName ?? null,
                  connections: count ?? 0,
                }
              },
            ),
          }

    return NextResponse.json({
      server: status,
      nodes: {
        total: nodes.length,
        active: activeNodeCount,
        items: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          region: n.region ?? null,
          status: n.status,
          hostname: n.hostname,
          tags: n.tags,
          provider: n.provider ?? null,
          lastHeartbeatAt: n.lastHeartbeatAt,
        })),
      },
      users: {
        total: users.length,
        active: users.filter((u) => u.status === "active").length,
      },
      online,
      bandwidth: (() => {
        if (!trafficResult) return { available: false, totalTx: 0, totalRx: 0 }
        let totalTx = 0
        let totalRx = 0
        for (const v of Object.values(trafficResult)) {
          totalTx += v.tx ?? 0
          totalRx += v.rx ?? 0
        }
        return { available: true, totalTx, totalRx }
      })(),
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
