import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import {
  listCredentials,
  createCredential,
  countCredentials,
  getCredentialStats,
} from "@/lib/db/credentials"
import { CredentialCreate } from "@/lib/db/schema"
import { parsePagination, paginatedResponse } from "@/lib/pagination"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/credentials - List credentials with filters
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") as any
    const domain = searchParams.get("domain") || undefined
    const sourceHostId = searchParams.get("sourceHostId") || undefined
    const search = searchParams.get("search") || undefined
    
    const { page, pageSize, skip, take } = parsePagination(searchParams)
    
    const [credentials, total, stats] = await Promise.all([
      listCredentials({
        skip,
        take,
        type,
        domain,
        sourceHostId,
        search,
      }),
      countCredentials({
        type,
        domain,
        sourceHostId,
        search,
      }),
      getCredentialStats(),
    ])
    
    const { pagination } = paginatedResponse(credentials, total, page, pageSize)
    
    return NextResponse.json({ credentials, pagination, stats })
  } catch (error) {
    console.error("List credentials error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/admin/credentials - Create a new credential
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const parsed = CredentialCreate.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "bad_request", issues: parsed.error.issues },
        { status: 400 }
      )
    }
    
    const credential = await createCredential(parsed.data)
    return NextResponse.json({ credential }, { status: 201 })
  } catch (error) {
    console.error("Create credential error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}