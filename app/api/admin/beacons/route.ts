import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { listBeacons, createBeacon, countBeacons, getBeaconStats } from "@/lib/db/beacons"
import { BeaconCreate } from "@/lib/db/schema"
import { parsePagination, paginatedResponse } from "@/lib/pagination"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/beacons - List beacons with filters
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") as any
    const privilegeLevel = searchParams.get("privilegeLevel") as any
    const osFamily = searchParams.get("osFamily") || undefined
    const domain = searchParams.get("domain") || undefined
    const search = searchParams.get("search") || undefined
    
    const { page, pageSize, skip, take } = parsePagination(searchParams)
    
    const [beacons, total, stats] = await Promise.all([
      listBeacons({
        skip,
        take,
        status,
        privilegeLevel,
        osFamily,
        domain,
        search,
      }),
      countBeacons({
        status,
        privilegeLevel,
        osFamily,
        domain,
        search,
      }),
      getBeaconStats(),
    ])
    
    const { pagination } = paginatedResponse(beacons, total, page, pageSize)
    
    return NextResponse.json({ beacons, pagination, stats })
  } catch (error) {
    console.error("List beacons error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/admin/beacons - Create a new beacon
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const parsed = BeaconCreate.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "bad_request", issues: parsed.error.issues },
        { status: 400 }
      )
    }
    
    const beacon = await createBeacon(parsed.data)
    return NextResponse.json({ beacon }, { status: 201 })
  } catch (error) {
    console.error("Create beacon error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}