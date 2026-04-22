import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getProfileById, updateProfile } from "@/lib/db/profiles"
import { getNodeById, updateNode } from "@/lib/db/nodes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/profiles/:id/apply
 * Body: { nodeIds: string[] }
 *
 * Links nodes to this profile and applies profile tags to each node.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const profile = await getProfileById(id)
    if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 })

    const body = await req.json().catch(() => null)
    const nodeIds: string[] = Array.isArray(body?.nodeIds) ? body.nodeIds : []
    if (nodeIds.length === 0) {
      return NextResponse.json({ error: "nodeIds required" }, { status: 400 })
    }

    // Validate all nodes exist
    const nodes = await Promise.all(nodeIds.map((nid) => getNodeById(nid)))
    const missing = nodeIds.filter((_, i) => !nodes[i])
    if (missing.length > 0) {
      return NextResponse.json({ error: "nodes_not_found", missing }, { status: 404 })
    }

    // Update profile to include these node IDs
    const existingIds = new Set(profile.nodeIds)
    for (const nid of nodeIds) existingIds.add(nid)
    await updateProfile(id, { nodeIds: [...existingIds] })

    // Apply profile tags to each node
    const results: { nodeId: string; ok: boolean }[] = []
    for (let i = 0; i < nodeIds.length; i++) {
      const node = nodes[i]!
      const mergedTags = [...new Set([...node.tags, ...profile.tags])]
      try {
        await updateNode(nodeIds[i], { tags: mergedTags })
        results.push({ nodeId: nodeIds[i], ok: true })
      } catch {
        results.push({ nodeId: nodeIds[i], ok: false })
      }
    }

    return NextResponse.json({
      applied: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
