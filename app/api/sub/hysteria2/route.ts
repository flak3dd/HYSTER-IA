import { NextResponse, type NextRequest } from "next/server"
import { getUserByAuthToken } from "@/lib/db/users"
import { listNodes } from "@/lib/db/nodes"
import { getServerConfig } from "@/lib/db/server-config"
import {
  renderSubscription,
  renderClashMetaYaml,
  renderSingBoxJson,
} from "@/lib/hysteria/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Public subscription endpoint — authenticated by the user's auth token (not admin session).
 *
 * GET /api/sub/hysteria2?token=<authToken>&format=base64|clash|singbox&tags=prod,us-east
 *
 * Returns configs for all matching nodes × this user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const token = url.searchParams.get("token")
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 })
  }

  const user = await getUserByAuthToken(token).catch(() => null)
  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "invalid or inactive token" }, { status: 403 })
  }

  const tagsParam = url.searchParams.get("tags")
  const filterTags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : []
  const format = url.searchParams.get("format") ?? "base64"

  const [allNodes, server] = await Promise.all([
    listNodes().catch(() => []),
    getServerConfig().catch(() => null),
  ])

  // filter to running nodes, optionally by tags
  let nodes = allNodes.filter((n) => n.status === "running")
  if (filterTags.length > 0) {
    nodes = nodes.filter((n) => filterTags.some((t) => n.tags.includes(t)))
  }

  if (nodes.length === 0) {
    return new NextResponse("# no matching nodes\n", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    })
  }

  const entries = nodes.map((node) => ({ user, node, server }))

  if (format === "clash") {
    return new NextResponse(renderClashMetaYaml(entries), {
      status: 200,
      headers: {
        "content-type": "application/yaml; charset=utf-8",
        "content-disposition": "attachment; filename=\"clash-meta.yaml\"",
        "cache-control": "no-store",
      },
    })
  }

  if (format === "singbox") {
    return new NextResponse(renderSingBoxJson(entries), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": "attachment; filename=\"sing-box.json\"",
        "cache-control": "no-store",
      },
    })
  }

  // default: base64-encoded hysteria2:// URIs
  return new NextResponse(renderSubscription(entries), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "subscription-userinfo": `upload=0; download=0; total=${user.quotaBytes ?? 0}; expire=${user.expiresAt ?? 0}`,
    },
  })
}
