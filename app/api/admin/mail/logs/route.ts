import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const { searchParams } = new URL(req.url)
    const limit = Number(searchParams.get('limit')) || 50
    const offset = Number(searchParams.get('offset')) || 0
    const type = searchParams.get('type')
    const to = searchParams.get('to')
    
    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (to) where.to = { contains: to, mode: 'insensitive' }
    
    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.emailLog.count({ where })
    ])
    
    return NextResponse.json({ logs, total, limit, offset })
  } catch (err) {
    return toErrorResponse(err)
  }
}