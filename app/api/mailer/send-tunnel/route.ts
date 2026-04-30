import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { sendResendEmail, logEmailToDatabase } from "@/lib/mailer/resend"
import { z } from "zod"

const SendTunnelPayload = z.object({
  to: z.string().email(),
  nodeId: z.string().optional(),
  tunnelType: z.string().optional(),
  tunnelConfig: z.string().optional(),
  customSubject: z.string().optional(),
  customMessage: z.string().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const body = await req.json()
    const validated = SendTunnelPayload.parse(body)
    
    const { to, nodeId, tunnelType, tunnelConfig, customSubject, customMessage } = validated
    
    // Generate tunnel script content
    const tunnelScript = tunnelConfig || generateDefaultTunnelScript(nodeId, tunnelType)
    
    // Create email content
    const subject = customSubject || `Hysteria 2 Tunnel Configuration${nodeId ? ` - Node ${nodeId}` : ''}`
    const message = customMessage || `Please find your Hysteria 2 tunnel configuration attached. Keep this information secure.`
    
    const htmlContent = generateTunnelEmailHtml(subject, message, tunnelScript, nodeId, tunnelType)
    const textContent = generateTunnelEmailText(subject, message, tunnelScript)
    
    // Send email via Resend
    const emailResult = await sendResendEmail({
      to,
      subject,
      html: htmlContent,
      text: textContent,
      tags: [
        { name: 'email_type', value: 'tunnel_script' },
        { name: 'tunnel_type', value: tunnelType || 'hysteria2' },
        ...(nodeId ? [{ name: 'node_id', value: nodeId }] : [])
      ]
    })
    
    if (!emailResult.success) {
      return NextResponse.json({ error: emailResult.error }, { status: 500 })
    }
    
    // Log to database
    const logResult = await logEmailToDatabase(
      to,
      subject,
      'tunnel_script',
      (emailResult.data as { id?: string })?.id,
      tunnelType,
      nodeId,
      'tunnel_configuration'
    )
    
    return NextResponse.json({
      success: true,
      messageId: (emailResult.data as { id?: string })?.id,
      logged: logResult.success,
      to,
      subject,
      tunnelType,
      nodeId
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: err.issues }, { status: 400 })
    }
    return toErrorResponse(err)
  }
}

function generateDefaultTunnelScript(nodeId?: string, tunnelType?: string): string {
  const timestamp = new Date().toISOString()
  return `# Hysteria 2 Tunnel Configuration
# Generated: ${timestamp}
${nodeId ? `# Node ID: ${nodeId}` : ''}
# Tunnel Type: ${tunnelType || 'hysteria2'}

# Configuration
server: your-server.com:443
auth: your-auth-token
obfs: salamander
obfs-password: your-obfs-password

# Note: Replace the above values with your actual configuration
# Keep this file secure and never share it with unauthorized parties
`
}

function generateTunnelEmailHtml(subject: string, message: string, tunnelScript: string, nodeId?: string, tunnelType?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <h1 style="color: #2c3e50; margin-top: 0;">Hysteria 2 Tunnel Configuration</h1>
    <p style="margin-bottom: 20px;">${message}</p>
    
    ${nodeId ? `<p><strong>Node ID:</strong> ${nodeId}</p>` : ''}
    ${tunnelType ? `<p><strong>Tunnel Type:</strong> ${tunnelType}</p>` : ''}
    
    <div style="background: #fff; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #495057;">Tunnel Configuration Script</h3>
      <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; white-space: pre-wrap;">${escapeHtml(tunnelScript)}</pre>
    </div>
    
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
      <strong style="color: #856404;">⚠️ Security Notice:</strong>
      <p style="margin: 5px 0 0 0; color: #856404;">This configuration contains sensitive authentication information. Keep it secure and never share it with unauthorized parties.</p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
    <p style="color: #6c757d; font-size: 12px; margin: 0;">
      Sent at ${new Date().toISOString()} by Hysteria 2 Admin Panel
    </p>
  </div>
</body>
</html>`
}

function generateTunnelEmailText(subject: string, message: string, tunnelScript: string): string {
  return `${subject}

${message}

${tunnelScript ? `
TUNNEL CONFIGURATION SCRIPT:
${'='.repeat(50)}
${tunnelScript}
${'='.repeat(50)}
` : ''}

⚠️ SECURITY NOTICE:
This configuration contains sensitive authentication information. 
Keep it secure and never share it with unauthorized parties.

---
Sent at ${new Date().toISOString()} by Hysteria 2 Admin Panel`
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}