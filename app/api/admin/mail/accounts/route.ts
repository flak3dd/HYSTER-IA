import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { loadMailAccounts, toSafeAccount } from "@/lib/mail/accounts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const accounts = await loadMailAccounts()
    return NextResponse.json({ accounts: accounts.map(toSafeAccount) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
