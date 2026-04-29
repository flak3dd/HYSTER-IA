import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ApprovalAction {
  approvalId: string
  action: 'approve' | 'reject'
  reason?: string
}

// GET: List pending approvals
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'pending'

    const approvals = await prisma.shadowGrokApproval.findMany({
      where: { 
        status: status as string,
        // Optional: Filter by requestedBy for non-admin users
        // requestedBy: admin.role === 'OPERATOR' ? admin.id : undefined,
      },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ approvals })

  } catch (err) {
    return toErrorResponse(err)
  }
}

// POST: Approve or reject a pending action
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const body = await req.json() as ApprovalAction

    if (!body.approvalId || !body.action) {
      return NextResponse.json(
        { error: 'approvalId and action are required' },
        { status: 400 }
      )
    }

    if (!['approve', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { error: 'action must be either "approve" or "reject"' },
        { status: 400 }
      )
    }

    const approval = await prisma.shadowGrokApproval.findUnique({
      where: { id: body.approvalId },
    })

    if (!approval) {
      return NextResponse.json(
        { error: 'Approval not found' },
        { status: 404 }
      )
    }

    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: 'Approval is not in pending status' },
        { status: 400 }
      )
    }

    // Check if approval has expired
    if (approval.expiresAt && approval.expiresAt < new Date()) {
      await prisma.shadowGrokApproval.update({
        where: { id: body.approvalId },
        data: { status: 'expired' },
      })
      return NextResponse.json(
        { error: 'Approval has expired' },
        { status: 400 }
      )
    }

    // Update approval status
    const updateData: any = {
      status: body.action === 'approve' ? 'approved' : 'rejected',
    }

    if (body.action === 'approve') {
      updateData.approvedBy = admin.id
      updateData.approvedAt = new Date()
    } else {
      updateData.rejectedBy = admin.id
      updateData.rejectedAt = new Date()
      updateData.reason = body.reason
    }

    const updatedApproval = await prisma.shadowGrokApproval.update({
      where: { id: body.approvalId },
      data: updateData,
    })

    // If approved, update the corresponding tool call
    if (body.action === 'approve') {
      // Find and update the tool call (this would need the execution ID)
      // For now, we'll just return the approval status
      // In a full implementation, this would trigger the actual tool execution
    }

    return NextResponse.json({ 
      approval: updatedApproval,
      message: `Approval ${body.action}d successfully`,
    })

  } catch (err) {
    return toErrorResponse(err)
  }
}