import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { validateMySmtpApiKey } from "@/lib/mailer/mysmtp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    // Validate my.smtp.com API key
    const validation = await validateMySmtpApiKey()
    
    return NextResponse.json({
      valid: validation.valid,
      error: validation.error
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}