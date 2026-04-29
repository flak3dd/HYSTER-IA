import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { promises as fs } from "fs"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAILER_DIR = path.join(process.cwd(), "mailer")
const CONFIG_PATH = path.join(MAILER_DIR, "config.json")
const ACCOUNTS_PATH = path.join(MAILER_DIR, "accounts.txt")

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const [configRaw, accountsRaw] = await Promise.all([
      fs.readFile(CONFIG_PATH, "utf-8").catch(() => "{}"),
      fs.readFile(ACCOUNTS_PATH, "utf-8").catch(() => ""),
    ])
    return NextResponse.json({
      config: JSON.parse(configRaw),
      accounts: accountsRaw,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    const { config, accounts } = body as {
      config?: Record<string, unknown>
      accounts?: string
    }
    if (config) {
      await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
    }
    if (typeof accounts === "string") {
      await fs.writeFile(ACCOUNTS_PATH, accounts, "utf-8")
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
