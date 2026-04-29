import { NextResponse, type NextRequest } from "next/server"
import { getUserByAuthToken } from "@/lib/db/users"
import { listNodes } from "@/lib/db/nodes"
import { getServerConfig } from "@/lib/db/server-config"
import { getProfileById, resolveProfileConfig } from "@/lib/db/profiles"
import type { ResolvedProfileConfig } from "@/lib/db/profiles"
import { renderClientUri } from "@/lib/hysteria/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getNodeProfileConfig(profileId: string | null | undefined): Promise<ResolvedProfileConfig | undefined> {
  if (!profileId) return undefined
  const profile = await getProfileById(profileId).catch(() => null)
  if (!profile) return undefined
  return resolveProfileConfig(profile)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 })
    }

    const user = await getUserByAuthToken(token)
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (user.status !== "active") {
      return NextResponse.json({ error: "Account is disabled" }, { status: 403 })
    }

    const nodes = await listNodes()
    const runningNodes = nodes.filter((n) => n.status === "running")

    if (runningNodes.length === 0) {
      return NextResponse.json({ error: "No running nodes available" }, { status: 503 })
    }

    const tagsParam = searchParams.get("tags")
    const filterTags = tagsParam ? tagsParam.split(",").map((t) => t.trim()) : null

    const filteredNodes = filterTags
      ? runningNodes.filter((n) => n.tags.some((t) => filterTags.includes(t)))
      : runningNodes

    if (filteredNodes.length === 0) {
      return NextResponse.json({ error: "No nodes match the requested tags" }, { status: 404 })
    }

    const format = searchParams.get("format") ?? "base64"
    const server = await getServerConfig().catch(() => null)

    const uris = await Promise.all(
      filteredNodes.map(async (node) => {
        const profileConfig = await getNodeProfileConfig(node.profileId)
        return renderClientUri(user, node, server, profileConfig)
      }),
    )

    if (format === "base64") {
      const body = Buffer.from(uris.join("\n")).toString("base64")
      return new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      })
    }

    return NextResponse.json({ uris })
  } catch (error) {
    console.error("Subscription error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
