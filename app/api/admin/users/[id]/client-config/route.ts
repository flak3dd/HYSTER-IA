import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getUserById } from "@/lib/db/users"
import { getNodeById, listNodes } from "@/lib/db/nodes"
import { getServerConfig } from "@/lib/db/server-config"
import {
  renderClientYaml,
  renderClientUri,
  renderSubscription,
  type ClientConfigOptions,
} from "@/lib/hysteria/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const user = await getUserById(id)
    if (!user) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const url = new URL(req.url)
    const format = url.searchParams.get("format") ?? "yaml" // yaml | uri | subscription | json
    const nodeId = url.searchParams.get("node")
    const lazy = url.searchParams.get("lazy") === "1"
    const socks5Listen = url.searchParams.get("socks5") ?? undefined
    const httpListen = url.searchParams.get("http") ?? undefined
    const opts: ClientConfigOptions = { lazy, socks5Listen, httpListen }

    const server = await getServerConfig().catch(() => null)

    if (format === "subscription") {
      // all nodes × this user
      const nodes = await listNodes()
      if (nodes.length === 0) {
        return NextResponse.json({ error: "no_nodes" }, { status: 400 })
      }
      const body = renderSubscription(
        nodes.map((n) => ({ user, node: n, server })),
      )
      return new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      })
    }

    // single node required for yaml / uri / json
    const selectedNode = nodeId ? await getNodeById(nodeId) : (await listNodes())[0] ?? null
    if (!selectedNode) {
      return NextResponse.json(
        { error: nodeId ? "node_not_found" : "no_nodes_in_inventory" },
        { status: 404 },
      )
    }

    if (format === "yaml") {
      return new NextResponse(renderClientYaml(user, selectedNode, server, opts), {
        status: 200,
        headers: {
          "content-type": "application/yaml; charset=utf-8",
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="${user.displayName}-${selectedNode.name}.yaml"`,
        },
      })
    }

    if (format === "uri") {
      return new NextResponse(renderClientUri(user, selectedNode, server), {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      })
    }

    if (format === "json") {
      return NextResponse.json({
        yaml: renderClientYaml(user, selectedNode, server, opts),
        uri: renderClientUri(user, selectedNode, server),
        subscriptionNote:
          "Add ?format=subscription to this URL to receive a base64-encoded blob of hysteria2:// URIs for all nodes.",
      })
    }

    return NextResponse.json({ error: "unknown_format" }, { status: 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
