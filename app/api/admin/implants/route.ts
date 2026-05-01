import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { listImplants, createImplant, getImplantStats, countImplants } from "@/lib/db/implants"
import { parsePagination, paginatedResponse } from "@/lib/pagination"
import logger from "@/lib/logger"

const log = logger.child({ module: "api/implants" })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ImplantCreateSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1),
  architecture: z.string().min(1),
  targetId: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
  transportConfig: z.record(z.string(), z.unknown()),
  nodeId: z.string().optional(),
})

// GET /api/admin/implants - List implants (paginated)
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { page, pageSize, skip, take } = parsePagination(new URL(req.url).searchParams)
    const [implants, total, stats] = await Promise.all([
      listImplants({ skip, take }),
      countImplants(),
      getImplantStats(),
    ])
    const { pagination } = paginatedResponse(implants, total, page, pageSize)

    return NextResponse.json({ implants, pagination, stats })
  } catch (error) {
    log.error({ err: error }, "List implants error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/admin/implants - Create a new implant record
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const parsed = ImplantCreateSchema.parse(body)

    const implant = await createImplant(parsed)

    return NextResponse.json(implant, { status: 201 })
  } catch (error) {
    log.error({ err: error }, "Create implant error")
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
