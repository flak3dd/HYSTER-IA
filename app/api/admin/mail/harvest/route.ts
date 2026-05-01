import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { harvestEmails, getUniqueEmails, exportEmailsToCsv } from "@/lib/osint/email-harvester"
import { z } from "zod"

const HarvestSchema = z.object({
  target: z.string().min(1),
  options: z.object({
    includeWhois: z.boolean().optional(),
    includeDnsMx: z.boolean().optional(),
    includeWebsiteContent: z.boolean().optional(),
    includeDnsTxt: z.boolean().optional(),
    maxEmailsPerSource: z.number().optional(),
    validateEmails: z.boolean().optional(),
  }).optional(),
  minConfidence: z.enum(['high', 'medium', 'low']).optional(),
  exportFormat: z.enum(['json', 'csv']).optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const body = await req.json()
    const validated = HarvestSchema.parse(body)

    // Perform email harvesting
    const result = await harvestEmails(validated.target, validated.options)

    // Get unique emails with minimum confidence
    const uniqueEmails = getUniqueEmails(result, validated.minConfidence)

    // Export in requested format
    if (validated.exportFormat === 'csv') {
      const csv = exportEmailsToCsv(result)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="emails-${validated.target}-${Date.now()}.csv"`
        }
      })
    }

    return NextResponse.json({
      success: true,
      harvest: {
        target: result.target,
        totalEmails: result.totalEmails,
        highConfidence: result.highConfidence,
        mediumConfidence: result.mediumConfidence,
        lowConfidence: result.lowConfidence,
        sources: result.sources,
        uniqueEmails,
        uniqueEmailsCount: uniqueEmails.length,
        timestamp: result.timestamp
      },
      emails: result.emails
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: err.issues }, { status: 400 })
    }
    return toErrorResponse(err)
  }
}