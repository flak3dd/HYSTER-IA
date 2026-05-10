import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  updateSmtpConfig,
  deleteSmtpConfig,
  getSmtpConfigById,
  SmtpConfigUpdate,
} from "@/lib/mailer/smtp-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/mail/smtp-configs/:id
 * Get a single SMTP configuration by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const config = await getSmtpConfigById(id)
    if (!config) {
      return NextResponse.json(
        { error: "SMTP config not found" },
        { status: 404 }
      )
    }
    return NextResponse.json({ config })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PATCH /api/admin/mail/smtp-configs/:id
 * Update an existing SMTP configuration
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const body = await req.json()
    const validated = SmtpConfigUpdate.parse(body)
    const config = await updateSmtpConfig(id, validated)
    return NextResponse.json({ success: true, config })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: (err as any).issues },
        { status: 400 }
      )
    }
    return toErrorResponse(err)
  }
}

/**
 * DELETE /api/admin/mail/smtp-configs/:id
 * Delete an SMTP configuration
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    await deleteSmtpConfig(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
