/**
 * Generates the shell script that runs on a fresh VPS to install and configure
 * Hysteria 2, acme.sh TLS certs, and a systemd service unit.
 */

export type ProvisionScriptOpts = {
  domain?: string
  ip: string
  port: number
  panelUrl: string
  authBackendSecret?: string
  trafficStatsSecret: string
  obfsPassword?: string
  email?: string
  bandwidthUp?: string
  bandwidthDown?: string
}

export function buildProvisionScript(opts: ProvisionScriptOpts): string {
  const listen = `:${opts.port}`
  const domain = opts.domain ?? opts.ip
  const useDomain = !!opts.domain

  const tlsBlock = useDomain
    ? `tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem`
    : `tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem`

  const obfsBlock = opts.obfsPassword
    ? `\nobfs:
  type: salamander
  salamander:
    password: "${opts.obfsPassword}"`
    : ""

  const bwBlock =
    opts.bandwidthUp || opts.bandwidthDown
      ? `\nbandwidth:${opts.bandwidthUp ? `\n  up: "${opts.bandwidthUp}"` : ""}${opts.bandwidthDown ? `\n  down: "${opts.bandwidthDown}"` : ""}`
      : ""

  const authUrl = `${opts.panelUrl}/api/hysteria/auth`

  const hysteriaConfig = `listen: "${listen}"

${tlsBlock}${obfsBlock}${bwBlock}

auth:
  type: http
  http:
    url: "${authUrl}"
    insecure: false

trafficStats:
  listen: ":25000"
  secret: "${opts.trafficStatsSecret}"

masquerade:
  type: proxy
  proxy:
    url: "https://www.google.com"
    rewriteHost: true
`

  const acmeSection = useDomain
    ? `
echo "[4/7] Installing acme.sh and issuing certificate..."
curl -fsSL https://get.acme.sh | sh -s email=${opts.email ?? `admin@${domain}`}
export PATH="$PATH:$HOME/.acme.sh"
~/.acme.sh/acme.sh --issue -d ${domain} --standalone --httpport 80 --force || true
~/.acme.sh/acme.sh --install-cert -d ${domain} \\
  --cert-file /etc/hysteria/cert.pem \\
  --key-file /etc/hysteria/key.pem \\
  --reloadcmd "systemctl restart hysteria-server" || true
chmod 600 /etc/hysteria/key.pem
`
    : `
echo "[4/7] Generating self-signed certificate (no domain provided)..."
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \\
  -keyout /etc/hysteria/key.pem -out /etc/hysteria/cert.pem \\
  -days 3650 -nodes -subj "/CN=${opts.ip}"
chmod 600 /etc/hysteria/key.pem
`

  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "[1/7] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

echo "[2/7] Installing dependencies..."
apt-get install -y -qq curl openssl ufw

echo "[3/7] Downloading Hysteria 2 binary..."
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) HY_ARCH="amd64" ;;
  aarch64) HY_ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

LATEST=$(curl -fsSL https://api.github.com/repos/apernet/hysteria/releases/latest | grep tag_name | head -1 | cut -d '"' -f 4)
curl -fsSL -o /usr/local/bin/hysteria "https://github.com/apernet/hysteria/releases/download/\${LATEST}/hysteria-linux-\${HY_ARCH}"
chmod +x /usr/local/bin/hysteria
echo "Installed: $(/usr/local/bin/hysteria version 2>/dev/null || echo 'unknown')"

mkdir -p /etc/hysteria
${acmeSection}
echo "[5/7] Writing Hysteria config..."
cat > /etc/hysteria/config.yaml << 'HYSTERIA_CONFIG_EOF'
${hysteriaConfig}HYSTERIA_CONFIG_EOF

echo "[6/7] Creating systemd service..."
cat > /etc/systemd/system/hysteria-server.service << 'SYSTEMD_EOF'
[Unit]
Description=Hysteria 2 Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hysteria server -c /etc/hysteria/config.yaml
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

systemctl daemon-reload
systemctl enable hysteria-server
systemctl start hysteria-server

echo "[7/7] Configuring firewall..."
ufw allow ${opts.port}/udp
ufw allow ${opts.port}/tcp
ufw allow 22/tcp
ufw allow 25000/tcp
ufw --force enable

echo "=== Hysteria 2 deployment complete ==="
echo "Status: $(systemctl is-active hysteria-server)"
echo "Listen: ${listen}"
echo "Domain: ${domain}"
`
}
