import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { executeCampaign, getCampaignStats } from "@/lib/mailer/enhanced-mailer"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - Get campaign details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const { id } = await params

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id }
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const stats = await getCampaignStats(id)

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        provider: campaign.provider,
        tunnelScriptType: campaign.tunnelScriptType,
        nodeId: campaign.nodeId,
        targetDomains: JSON.parse(campaign.targetDomains),
        harvestedEmails: campaign.harvestedEmails,
        selectedEmails: JSON.parse(campaign.selectedEmails),
        totalRecipients: campaign.totalRecipients,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        scheduledFor: campaign.scheduledFor,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        metadata: campaign.metadata,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt
      },
      stats
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// POST - Execute campaign
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const { id } = await params

    const result = await executeCampaign(id)

    return NextResponse.json({
      success: true,
      result
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// DELETE - Delete campaign
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const { id } = await params

    await prisma.emailCampaign.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: "Campaign deleted successfully"
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}