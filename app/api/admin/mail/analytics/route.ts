import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const searchParams = req.nextUrl.searchParams
    const period = searchParams.get('period') || '7d' // 7d, 30d, 90d, all
    const tunnelType = searchParams.get('tunnelType')

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case 'all':
        startDate = new Date(0)
        break
    }

    // Build where clause
    const where: any = {
      sentAt: {
        gte: startDate
      }
    }

    if (tunnelType) {
      where.tunnelType = tunnelType
    }

    // Get email logs
    const emailLogs = await prisma.emailLog.findMany({
      where,
      orderBy: { sentAt: 'desc' }
    })

    // Get campaigns
    const campaigns = await prisma.emailCampaign.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Calculate analytics
    const totalEmails = emailLogs.length
    const tunnelScriptEmails = emailLogs.filter(e => e.type === 'tunnel_script').length
    const notificationEmails = emailLogs.filter(e => e.type === 'notification').length

    // Group by tunnel type
    const byTunnelType: Record<string, number> = {}
    emailLogs.forEach(log => {
      if (log.tunnelType) {
        byTunnelType[log.tunnelType] = (byTunnelType[log.tunnelType] || 0) + 1
      }
    })

    // Group by date
    const byDate: Record<string, number> = {}
    emailLogs.forEach(log => {
      const date = log.sentAt.toISOString().split('T')[0]
      byDate[date] = (byDate[date] || 0) + 1
    })

    // Campaign analytics
    const totalCampaigns = campaigns.length
    const completedCampaigns = campaigns.filter(c => c.status === 'completed').length
    const runningCampaigns = campaigns.filter(c => c.status === 'running').length
    const scheduledCampaigns = campaigns.filter(c => c.status === 'scheduled').length

    const totalRecipients = campaigns.reduce((sum, c) => sum + c.totalRecipients, 0)
    const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0)
    const totalFailed = campaigns.reduce((sum, c) => sum + c.failedCount, 0)

    const successRate = totalSent > 0 ? ((totalSent / totalRecipients) * 100).toFixed(2) : '0'

    // Recent activity
    const recentActivity = emailLogs.slice(0, 10).map(log => ({
      id: log.id,
      to: log.to,
      subject: log.subject,
      type: log.type,
      tunnelType: log.tunnelType,
      sentAt: log.sentAt
    }))

    return NextResponse.json({
      success: true,
      period,
      dateRange: {
        start: startDate,
        end: now
      },
      overview: {
        totalEmails,
        tunnelScriptEmails,
        notificationEmails,
        totalCampaigns,
        completedCampaigns,
        runningCampaigns,
        scheduledCampaigns
      },
      campaigns: {
        totalRecipients,
        totalSent,
        totalFailed,
        successRate: parseFloat(successRate)
      },
      breakdown: {
        byTunnelType,
        byDate
      },
      recentActivity
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}