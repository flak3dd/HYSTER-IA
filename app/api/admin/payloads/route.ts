import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import {
  listPayloadBuilds,
  createPayloadBuild,
  deletePayloadBuild,
  getPayloadBuildStats,
  countPayloadBuilds,
} from "@/lib/db/payload-builds"
import { parsePagination, paginatedResponse } from "@/lib/pagination"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import logger from "@/lib/logger"

const log = logger.child({ module: "api/payloads" })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PayloadBuildCreateSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1),
  description: z.string().max(500).optional(),
  config: z.record(z.string(), z.unknown()),
})

// GET /api/admin/payloads - List payload builds (paginated)
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const createdBy = searchParams.get('createdBy') || undefined
    const { page, pageSize, skip, take } = parsePagination(searchParams)

    const [builds, total, stats] = await Promise.all([
      listPayloadBuilds(createdBy, 50, { skip, take }),
      countPayloadBuilds(createdBy),
      getPayloadBuildStats(),
    ])
    const { pagination } = paginatedResponse(builds, total, page, pageSize)

    return NextResponse.json({ builds, pagination, stats })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST /api/admin/payloads - Create a new payload build
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    const parsed = PayloadBuildCreateSchema.parse(body)

    const build = await createPayloadBuild({
      ...parsed,
      createdBy: body.createdBy,
    })

    return NextResponse.json(build, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/admin/payloads - Delete a payload build
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    const success = await deletePayloadBuild(id)
    if (!success) {
      return NextResponse.json({ error: "Payload build not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
