import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { access, readFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { join } from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type OpProfileId = "node_setup" | "beacon_build" | "deployment" | "post_exploit" | "monitoring"

type ProfileDetection = {
  id: OpProfileId
  label: string
  detected: boolean
  evidence: string[]
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readEnvFile(cwd: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(cwd, ".env.local"), "utf8")
    const env: Record<string, string> = {}
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
      if (match) env[match[1]] = match[2]
    }
    return env
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const cwd = process.cwd()
    const env = await readEnvFile(cwd)

    const hasHysteriaTrafficApi = Boolean(env.HYSTERIA_TRAFFIC_API_BASE_URL)
    const hasShadowGrok = env.SHADOWGROK_ENABLED === "true"
    const hasMail = Boolean(env.RESEND_API_KEY || env.MYSMTP_API_KEY)
    const hasThreatIntel = Boolean(env.VIRUSTOTAL_API_KEY || env.ALIENVAULT_OTX_KEY)

    const detections: ProfileDetection[] = [
      {
        id: "node_setup",
        label: "Node Setup",
        detected: hasHysteriaTrafficApi,
        evidence: hasHysteriaTrafficApi
          ? ["HYSTERIA_TRAFFIC_API_BASE_URL configured in .env.local"]
          : [],
      },
      {
        id: "beacon_build",
        label: "Beacon Build",
        detected: true,
        evidence: ["Implant builder module available in /admin/implants"],
      },
      {
        id: "deployment",
        label: "Deployment",
        detected: hasMail,
        evidence: hasMail
          ? ["Mail provider configured (Resend or mySMTP)"]
          : [],
      },
      {
        id: "post_exploit",
        label: "Post-Exploitation",
        detected: hasShadowGrok,
        evidence: hasShadowGrok
          ? ["ShadowGrok enabled in .env.local"]
          : [],
      },
      {
        id: "monitoring",
        label: "Monitoring",
        detected: true,
        evidence: ["Dashboard and analytics modules available"],
      },
    ]

    const primaryProfile: OpProfileId =
      detections.find((d) => d.id === "node_setup")?.detected
        ? "node_setup"
        : detections.find((d) => d.id === "beacon_build")?.detected
          ? "beacon_build"
          : "monitoring"

    return NextResponse.json({
      primaryProfile,
      profiles: detections,
      env: {
        hysteriaConfigured: hasHysteriaTrafficApi,
        shadowGrokEnabled: hasShadowGrok,
        mailConfigured: hasMail,
        threatIntelConfigured: hasThreatIntel,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
