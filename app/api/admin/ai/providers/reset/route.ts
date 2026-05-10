import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { resetAllProviderState, resetProviderState } from "@/lib/ai/provider-fallback"

const resetSchema = z.object({
  provider: z.string().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const body = await req.json()
    const { provider } = resetSchema.parse(body)
    
    if (provider) {
      // Reset specific provider
      resetProviderState(provider)
      return NextResponse.json({
        success: true,
        message: `Provider ${provider} state reset successfully`,
      })
    } else {
      // Reset all providers
      resetAllProviderState()
      return NextResponse.json({
        success: true,
        message: "All provider state reset successfully",
      })
    }
  } catch (error) {
    return toErrorResponse(error)
  }
}
