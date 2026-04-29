"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

function timeAgo(ts: number | null): string {
  if (!ts) return "never"
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

interface NodeStatus {
  id: string
  name: string
  status: "running" | "stopped" | "errored"
  region: string
  provider: string
  hostname: string
  lastHeartbeatAt: number | null
}

type ShellState =
  | { open: false }
  | { open: true; loading: true; node: NodeStatus }
  | { open: true; loading: false; node: NodeStatus; script: string }

type InstallState =
  | { open: false }
  | { open: true; phase: "form"; node: NodeStatus }
  | { open: true; phase: "script"; node: NodeStatus; script: string }

export function InfrastructureOverview() {
  const [nodes, setNodes] = useState<NodeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [shell, setShell] = useState<ShellState>({ open: false })
  const [install, setInstall] = useState<InstallState>({ open: false })
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch("/api/admin/nodes", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          const items: NodeStatus[] = (data.nodes ?? data ?? []).map((n: Record<string, unknown>) => ({
            id: n.id as string,
            name: n.name as string,
            status: (n.status as string) ?? "stopped",
            region: (n.region as string) ?? "unknown",
            provider: (n.provider as string) ?? "unknown",
            hostname: (n.hostname as string) ?? "",
            lastHeartbeatAt: (n.lastHeartbeatAt as number | null) ?? null,
          }))
          setNodes(items)
        }
      } catch {
        // fallback to empty
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleNodeAction = (nodeId: string, action: string) => {
    toast.success(`Node ${nodeId}: ${action} action initiated`)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-green-500"
      case "stopped": return "bg-gray-500"
      case "errored": return "bg-red-500"
      default: return "bg-gray-500"
    }
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "running": return "default"
      case "stopped": return "secondary"
      case "errored": return "destructive"
      default: return "secondary"
    }
  }

  const handleSpawnShell = useCallback(async (node: NodeStatus) => {
    setShell({ open: true, loading: true, node })

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const res = await fetch("/api/admin/deploy/provision-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: node.hostname,
          domain: node.hostname.match(/^[0-9.]+$/) ? undefined : node.hostname,
          port: 443,
          panelUrl: origin,
          trafficStatsSecret: "changeme-" + node.id.slice(0, 16),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        toast.error("Failed to generate script", { description: err.error ?? String(res.status) })
        setShell({ open: false })
        return
      }
      const { script } = await res.json()
      setShell({ open: true, loading: false, node, script })
    } catch {
      toast.error("Failed to generate provision script")
      setShell({ open: false })
    }
  }, [])

  const handleCopyScript = useCallback(() => {
    if (shell.open && !shell.loading) {
      navigator.clipboard.writeText(shell.script).then(
        () => toast.success("Script copied to clipboard"),
        () => toast.error("Failed to copy"),
      )
    }
  }, [shell])

  if (loading) {
    return (
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Infrastructure Nodes</CardTitle>
            <CardDescription>Loading infrastructure status...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Nodes</CardDescription>
            <CardTitle className="text-3xl font-bold">{nodes.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across all regions
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Running</CardDescription>
            <CardTitle className="text-3xl font-bold text-green-600">
              {nodes.filter(n => n.status === "running").length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Active nodes
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stopped</CardDescription>
            <CardTitle className="text-3xl font-bold text-muted-foreground">
              {nodes.filter(n => n.status === "stopped").length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Inactive nodes
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Regions</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {new Set(nodes.map(n => n.region)).size}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Geographic distribution
          </CardContent>
        </Card>
      </div>

      {/* Nodes List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Infrastructure Nodes</CardTitle>
              <CardDescription>Manage your deployed infrastructure nodes</CardDescription>
            </div>
            <Button>Add Node</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {nodes.length === 0 && (
              <p className="text-sm text-muted-foreground">No nodes registered yet.</p>
            )}
            {nodes.map((node) => (
              <div key={node.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(node.status)}`} />
                  <div>
                    <h3 className="font-medium">{node.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {node.region} &middot; {node.provider} &middot; Last seen: {timeAgo(node.lastHeartbeatAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={getStatusVariant(node.status)}>
                    {node.status}
                  </Badge>
                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleNodeAction(node.id, "restart")}
                    >
                      Restart
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleNodeAction(node.id, "configure")}
                    >
                      Configure
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => setInstall({ open: true, phase: "form", node })}
                    >
                      Install Hysteria
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSpawnShell(node)}
                    >
                      Spawn Shell
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shell Script Modal */}
      {shell.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Provision Script &mdash; {shell.node.name}
                  </CardTitle>
                  <CardDescription>
                    Run this on a fresh VPS to deploy Hysteria 2 for <code className="text-xs">{shell.node.hostname}</code>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {!shell.loading && (
                    <Button size="sm" variant="outline" onClick={handleCopyScript}>
                      Copy
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setShell({ open: false })}>
                    Close
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pb-4">
              {shell.loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-pulse text-sm text-muted-foreground">Generating provision script...</div>
                </div>
              ) : (
                <pre
                  ref={preRef}
                  className="h-full max-h-[60vh] overflow-auto rounded-md bg-zinc-950 p-4 text-xs text-green-400 font-mono leading-relaxed whitespace-pre"
                >
                  {shell.script}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Install Hysteria Modal */}
      {install.open && (
        <InstallHysteriaModal
          node={install.node}
          state={install}
          onClose={() => setInstall({ open: false })}
          onGenerated={(script) => setInstall({ open: true, phase: "script", node: install.node, script })}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Install Hysteria Modal                                             */
/* ------------------------------------------------------------------ */

function InstallHysteriaModal({
  node,
  state,
  onClose,
  onGenerated,
}: {
  node: NodeStatus
  state: InstallState & { open: true }
  onClose: () => void
  onGenerated: (script: string) => void
}) {
  const [port, setPort] = useState("443")
  const [obfsPassword, setObfsPassword] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [panelUrl, setPanelUrl] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  )
  const [trafficSecret, setTrafficSecret] = useState(() =>
    randomHex(20)
  )
  const [usePanelAuth, setUsePanelAuth] = useState(true)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      if (usePanelAuth) {
        // Use the provision-script API for panel-integrated auth
        const res = await fetch("/api/admin/deploy/provision-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: node.hostname,
            domain: node.hostname.match(/^[0-9.]+$/) ? undefined : node.hostname,
            port: parseInt(port) || 443,
            panelUrl: panelUrl.trim(),
            trafficStatsSecret: trafficSecret,
            obfsPassword: obfsPassword.trim() || undefined,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }))
          toast.error("Failed to generate script", { description: err.error ?? err.issues?.[0]?.message ?? String(res.status) })
          setGenerating(false)
          return
        }
        const { script } = await res.json()
        onGenerated(script)
      } else {
        // Standalone mode with password auth
        const script = buildStandaloneScript({
          ip: node.hostname,
          port: parseInt(port) || 443,
          obfsPassword: obfsPassword.trim(),
          authPassword: authPassword.trim() || "changeme123",
        })
        onGenerated(script)
      }
    } catch {
      toast.error("Failed to generate install script")
    }
    setGenerating(false)
  }

  const handleCopy = () => {
    if (state.phase === "script") {
      navigator.clipboard.writeText(state.script).then(
        () => toast.success("Script copied to clipboard"),
        () => toast.error("Failed to copy"),
      )
    }
  }

  const handleCopySsh = () => {
    const cmd = `ssh root@${node.hostname}`
    navigator.clipboard.writeText(cmd).then(
      () => toast.success("SSH command copied"),
      () => toast.error("Failed to copy"),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Install Hysteria 2 &mdash; {node.name}
              </CardTitle>
              <CardDescription>
                Target: <code className="text-xs">{node.hostname}</code>
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCopySsh}>
                Copy SSH
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto pb-4">
          {state.phase === "form" && (
            <div className="space-y-4">
              {/* Auth mode */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Authentication Mode</label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={usePanelAuth ? "default" : "outline"}
                    onClick={() => setUsePanelAuth(true)}
                  >
                    Panel Auth (HTTP callback)
                  </Button>
                  <Button
                    size="sm"
                    variant={!usePanelAuth ? "default" : "outline"}
                    onClick={() => setUsePanelAuth(false)}
                  >
                    Standalone (password)
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {usePanelAuth
                    ? "Node will authenticate users via your panel's API. Panel must be publicly accessible."
                    : "Simple password auth -- no panel connection needed."}
                </p>
              </div>

              {/* Panel URL (only for panel auth) */}
              {usePanelAuth && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Panel URL (public)</label>
                  <input
                    value={panelUrl}
                    onChange={(e) => setPanelUrl(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                    placeholder="https://your-panel.com"
                  />
                </div>
              )}

              {/* Auth password (standalone) */}
              {!usePanelAuth && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Auth Password (clients use this to connect)</label>
                  <input
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                    placeholder="your-secret-password"
                  />
                </div>
              )}

              {/* Port */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Port</label>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    type="number"
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Traffic Stats Secret</label>
                  <input
                    value={trafficSecret}
                    onChange={(e) => setTrafficSecret(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Obfs */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Obfuscation Password (optional, enables salamander)</label>
                <input
                  value={obfsPassword}
                  onChange={(e) => setObfsPassword(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                  placeholder="Leave empty to disable obfuscation"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? "Generating..." : "Generate Install Script"}
                </Button>
              </div>
            </div>
          )}

          {state.phase === "script" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  SSH into <code className="font-mono">root@{node.hostname}</code> and paste this script:
                </p>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  Copy Script
                </Button>
              </div>
              <pre className="max-h-[55vh] overflow-auto rounded-md bg-zinc-950 p-4 text-xs text-green-400 font-mono leading-relaxed whitespace-pre">
                {state.script}
              </pre>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onGenerated("")}>
                  Back
                </Button>
                <Button onClick={handleCopy}>
                  Copy to Clipboard
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Standalone script builder (no panel dependency)                    */
/* ------------------------------------------------------------------ */

function buildStandaloneScript(opts: {
  ip: string
  port: number
  obfsPassword: string
  authPassword: string
}): string {
  const obfsBlock = opts.obfsPassword
    ? `\nobfs:\n  type: salamander\n  salamander:\n    password: "${opts.obfsPassword}"`
    : ""

  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "[1/7] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

echo "[2/7] Installing dependencies..."
apt-get install -y -qq curl openssl ufw

echo "[3/7] Downloading Hysteria 2..."
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

echo "[4/7] Generating self-signed certificate..."
mkdir -p /etc/hysteria
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \\
  -keyout /etc/hysteria/key.pem -out /etc/hysteria/cert.pem \\
  -days 3650 -nodes -subj "/CN=${opts.ip}"
chmod 600 /etc/hysteria/key.pem

echo "[5/7] Writing config..."
cat > /etc/hysteria/config.yaml << 'HYSTERIA_EOF'
listen: ":${opts.port}"

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem
${obfsBlock}
auth:
  type: password
  password: "${opts.authPassword}"

masquerade:
  type: proxy
  proxy:
    url: "https://www.google.com"
    rewriteHost: true
HYSTERIA_EOF

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
ufw --force enable

echo ""
echo "=== Hysteria 2 Installed ==="
echo "Status: $(systemctl is-active hysteria-server)"
echo "Connect: hysteria2://${opts.authPassword}@${opts.ip}:${opts.port}/?insecure=1${opts.obfsPassword ? "&obfs=salamander&obfs-password=" + opts.obfsPassword : ""}"
`
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}
