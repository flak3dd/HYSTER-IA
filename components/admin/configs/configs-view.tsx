"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type NodeItem = {
  id: string
  name: string
  hostname: string
  region: string | null
  status: string
  tags: string[]
}

type UserItem = {
  id: string
  displayName: string
  authToken: string
  status: string
}

type GeneratedConfig = {
  yaml: string
  uri: string
  clashMeta: string
  singBox: string
  subscriptionUrl: string
  base64: string
}

type ConfigFormat = "hysteria2" | "clash" | "singbox"

/* ------------------------------------------------------------------ */
/*  Main view                                                         */
/* ------------------------------------------------------------------ */

export function ClientConfigsView() {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Loading…</p>}>
      <ClientConfigsViewInner />
    </Suspense>
  )
}

function ClientConfigsViewInner() {
  const searchParams = useSearchParams()
  const preselectedNodes = searchParams.get("nodes")

  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)

  // selection state — pre-fill from URL params if present
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(() => {
    if (preselectedNodes) {
      return new Set(preselectedNodes.split(",").filter(Boolean))
    }
    return new Set()
  })
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [format, setFormat] = useState<ConfigFormat>("hysteria2")
  const [multiNode, setMultiNode] = useState(true)
  const [bandwidthUp, setBandwidthUp] = useState("")
  const [bandwidthDown, setBandwidthDown] = useState("")
  const [lazy, setLazy] = useState(false)

  // generated output
  const [config, setConfig] = useState<GeneratedConfig | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/overview", { cache: "no-store" })
        if (!res.ok) throw new Error(`${res.status}`)
        const data = await res.json()
        const nodeItems: NodeItem[] = (data.nodes?.items ?? []).map(
          (n: Record<string, unknown>) => ({
            id: n.id as string,
            name: n.name as string,
            hostname: n.hostname as string,
            region: (n.region as string) ?? null,
            status: n.status as string,
            tags: Array.isArray(n.tags) ? (n.tags as string[]) : [],
          }),
        )
        setNodes(nodeItems)

        // fetch users separately
        const usersRes = await fetch("/api/admin/users", { cache: "no-store" })
        if (usersRes.ok) {
          const usersData = await usersRes.json()
          const items: UserItem[] = (Array.isArray(usersData) ? usersData : usersData.users ?? []).map(
            (u: Record<string, unknown>) => ({
              id: u.id as string,
              displayName: u.displayName as string,
              authToken: u.authToken as string,
              status: u.status as string,
            }),
          )
          setUsers(items)
          if (items.length > 0) setSelectedUserId(items[0].id)
        }
      } catch (err) {
        toast.error("Failed to load data", {
          description: err instanceof Error ? err.message : "unknown",
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleNode = useCallback(
    (id: string) => {
      setSelectedNodes((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [],
  )

  const selectAllNodes = useCallback(() => {
    setSelectedNodes(new Set(nodes.filter((n) => n.status === "running").map((n) => n.id)))
  }, [nodes])

  const clearNodes = useCallback(() => setSelectedNodes(new Set()), [])

  const generate = useCallback(async () => {
    if (!selectedUserId) {
      toast.error("Select a user first")
      return
    }
    const nodeIds = [...selectedNodes]
    if (nodeIds.length === 0) {
      toast.error("Select at least one node")
      return
    }
    setGenerating(true)
    try {
      const user = users.find((u) => u.id === selectedUserId)
      if (!user) throw new Error("user not found")

      // build subscription URL for this user
      const base = typeof window !== "undefined" ? window.location.origin : ""
      const subUrl = `${base}/api/sub/hysteria2?token=${encodeURIComponent(user.authToken)}`

      // fetch individual YAML for first node (or multi)
      const primaryNodeId = nodeIds[0]
      const params = new URLSearchParams({ format: "json" })
      if (lazy) params.set("lazy", "1")
      if (bandwidthUp || bandwidthDown) {
        // bandwidth hints are baked into the YAML via the endpoint
      }
      const yamlRes = await fetch(
        `/api/admin/users/${selectedUserId}/client-config?node=${primaryNodeId}&${params.toString()}`,
        { cache: "no-store" },
      )
      if (!yamlRes.ok) throw new Error(`config ${yamlRes.status}`)
      const yamlData = await yamlRes.json()

      // fetch subscription base64
      const subRes = await fetch(
        `/api/admin/users/${selectedUserId}/client-config?format=subscription`,
        { cache: "no-store" },
      )
      const base64 = subRes.ok ? await subRes.text() : ""

      // fetch Clash Meta
      const clashRes = await fetch(`${subUrl}&format=clash`, { cache: "no-store" })
      const clashMeta = clashRes.ok ? await clashRes.text() : "# failed to generate"

      // fetch sing-box
      const singRes = await fetch(`${subUrl}&format=singbox`, { cache: "no-store" })
      const singBox = singRes.ok ? await singRes.text() : "// failed to generate"

      setConfig({
        yaml: yamlData.yaml ?? "",
        uri: yamlData.uri ?? "",
        clashMeta,
        singBox,
        subscriptionUrl: subUrl,
        base64,
      })
      toast.success("Config generated")
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setGenerating(false)
    }
  }, [selectedUserId, selectedNodes, users, lazy, bandwidthUp, bandwidthDown])

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading nodes and users…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Client Configs &amp; Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Generate Hysteria2 client configs for your users across nodes.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_1fr]">
        {/* ---- Left panel: Node selector ---- */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Nodes</CardTitle>
            <CardDescription className="text-xs">Select nodes to include</CardDescription>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="xs" onClick={selectAllNodes}>
                All running
              </Button>
              <Button variant="ghost" size="xs" onClick={clearNodes}>
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-1 overflow-y-auto">
            {nodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No nodes in inventory</p>
            ) : (
              nodes.map((n) => (
                <label
                  key={n.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    selectedNodes.has(n.id) && "bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedNodes.has(n.id)}
                    onChange={() => toggleNode(n.id)}
                    className="accent-primary"
                  />
                  <span className="flex-1 truncate">{n.name}</span>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      n.status === "running" ? "bg-emerald-500" : "bg-zinc-400",
                    )}
                  />
                </label>
              ))
            )}
          </CardContent>
        </Card>

        {/* ---- Center panel: Config generator form ---- */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Config Generator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* User selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Format</label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["hysteria2", "Official Hysteria2"],
                    ["clash", "Clash Meta (YAML)"],
                    ["singbox", "sing-box"],
                  ] as const
                ).map(([val, label]) => (
                  <Button
                    key={val}
                    variant={format === val ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormat(val)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Multi-node toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={multiNode}
                onChange={(e) => setMultiNode(e.target.checked)}
                className="accent-primary"
              />
              Include multiple nodes
            </label>

            {/* Bandwidth hints */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Up (Mbps)</label>
                <input
                  type="text"
                  placeholder="e.g. 100"
                  value={bandwidthUp}
                  onChange={(e) => setBandwidthUp(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Down (Mbps)</label>
                <input
                  type="text"
                  placeholder="e.g. 500"
                  value={bandwidthDown}
                  onChange={(e) => setBandwidthDown(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* Lazy connect */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lazy}
                onChange={(e) => setLazy(e.target.checked)}
                className="accent-primary"
              />
              Lazy connect (connect on first packet)
            </label>

            <Button
              size="lg"
              className="w-full"
              onClick={generate}
              disabled={generating || !selectedUserId || selectedNodes.size === 0}
            >
              {generating ? "Generating…" : "Generate Config"}
            </Button>
          </CardContent>
        </Card>

        {/* ---- Right panel: Generated output ---- */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Generated Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!config ? (
              <p className="text-xs text-muted-foreground">
                Select nodes and a user, then click Generate.
              </p>
            ) : (
              <>
                {/* Subscription URL */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Subscription URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={config.subscriptionUrl}
                      className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(config.subscriptionUrl)
                        toast.success("Copied subscription URL")
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                {/* hysteria2:// URI */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    hysteria2:// URI
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={config.uri}
                      className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(config.uri)
                        toast.success("Copied URI")
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Config preview */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {format === "hysteria2"
                      ? "Hysteria2 YAML"
                      : format === "clash"
                        ? "Clash Meta YAML"
                        : "sing-box JSON"}
                  </label>
                  <pre className="max-h-[280px] overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                    {format === "hysteria2"
                      ? config.yaml
                      : format === "clash"
                        ? config.clashMeta
                        : config.singBox}
                  </pre>
                </div>

                {/* Base64 preview (collapsed) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Base64 encoded subscription (click to expand)
                  </summary>
                  <pre className="mt-2 max-h-[120px] overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-[10px] break-all whitespace-pre-wrap">
                    {config.base64}
                  </pre>
                </details>

                {/* Download buttons */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile("client-config.yaml", config.yaml, "application/yaml")}
                  >
                    Download .yaml
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile("clash-meta.yaml", config.clashMeta, "application/yaml")
                    }
                  >
                    Clash Meta .yaml
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile("sing-box.json", config.singBox, "application/json")
                    }
                  >
                    sing-box .json
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile("subscription.txt", config.base64, "text/plain")
                    }
                  >
                    Base64 sub file
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
