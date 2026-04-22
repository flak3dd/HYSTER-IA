"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { clientFirestore } from "@/lib/firebase/client"
import { cn } from "@/lib/utils"
import { WORKFLOW_STAGES } from "@/components/admin/sidebar"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Overview = {
  server: {
    state: "stopped" | "starting" | "running" | "stopping" | "errored"
    pid: number | null
    startedAt: number | null
    lastExitCode: number | null
    lastExitSignal: string | null
    lastError: string | null
  }
  nodes: {
    total: number
    active: number
    items: Array<{
      id: string
      name: string
      region: string | null
      status: string
      hostname: string
      tags: string[]
      provider: string | null
      lastHeartbeatAt: number | null
    }>
  }
  users: { total: number; active: number }
  online:
    | {
        available: true
        count: number
        clients: Array<{
          authTokenSuffix: string
          userId: string | null
          displayName: string | null
          connections: number
        }>
      }
    | { available: false; error: string; count: 0; clients: [] }
  bandwidth: { available: boolean; totalTx: number; totalRx: number }
  generatedAt: string
}

type LiveNode = {
  id: string
  name: string
  region: string | null
  status: string
  hostname: string
  tags: string[]
  provider: string | null
  lastHeartbeatAt: number | null
}

type ActivityEvent = {
  id: string
  time: number
  message: string
  type: "info" | "success" | "warning" | "error"
}

const POLL_MS = 5000

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never"
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function stateTone(state: string): string {
  switch (state) {
    case "running":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "starting":
    case "stopping":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
    case "errored":
      return "bg-red-500/15 text-red-700 dark:text-red-300"
    case "stopped":
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
    default:
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
  }
}

/* ------------------------------------------------------------------ */
/*  Delta toast emitters                                              */
/* ------------------------------------------------------------------ */

function emitServerClientDeltaToasts(
  prev: Overview,
  next: Overview,
  pushActivity: (msg: string, type: ActivityEvent["type"]) => void,
): void {
  if (prev.server.state !== next.server.state) {
    if (next.server.state === "running") {
      toast.success("Server started", {
        description: next.server.pid ? `pid ${next.server.pid}` : undefined,
      })
      pushActivity("Server started", "success")
    } else if (next.server.state === "stopped") {
      const code = next.server.lastExitCode
      toast.warning("Server stopped", {
        description: code != null ? `exit code ${code}` : undefined,
      })
      pushActivity(`Server stopped (code ${code ?? "?"})`, "warning")
    } else if (next.server.state === "errored") {
      toast.error("Server errored", {
        description: next.server.lastError ?? "see logs",
      })
      pushActivity(`Server errored: ${next.server.lastError ?? "unknown"}`, "error")
    } else if (next.server.state === "starting") {
      toast.info("Server starting...")
      pushActivity("Server starting", "info")
    }
  }

  if (prev.online.available && next.online.available) {
    const delta = next.online.count - prev.online.count
    if (delta > 0) {
      toast.info(`Client connected (+${delta})`, {
        description: `${next.online.count} online`,
      })
      pushActivity(`+${delta} client(s) connected (${next.online.count} online)`, "info")
    } else if (delta < 0) {
      toast.info(`Client disconnected (${delta})`, {
        description: `${next.online.count} online`,
      })
      pushActivity(`${delta} client(s) disconnected (${next.online.count} online)`, "info")
    }
  } else if (prev.online.available && !next.online.available) {
    toast.warning("Traffic stats API unavailable", { description: next.online.error })
    pushActivity("Traffic stats API went unavailable", "warning")
  } else if (!prev.online.available && next.online.available) {
    toast.success("Traffic stats API recovered")
    pushActivity("Traffic stats API recovered", "success")
  }
}

function emitNodeDeltaToasts(
  prev: Map<string, string>,
  next: LiveNode[],
  pushActivity: (msg: string, type: ActivityEvent["type"]) => void,
): void {
  const nextIds = new Set<string>()
  for (const n of next) {
    nextIds.add(n.id)
    const before = prev.get(n.id)
    if (before == null) {
      if (n.status === "running") {
        toast.info(`Node registered: ${n.name}`, { description: "running" })
        pushActivity(`Node ${n.name} registered (running)`, "info")
      }
      continue
    }
    if (before !== n.status) {
      if (n.status === "running") {
        toast.success(`Node ${n.name} went online`, {
          description: n.region ?? undefined,
        })
        pushActivity(`Node ${n.name} went online`, "success")
      } else if (n.status === "errored") {
        toast.error(`Node ${n.name} errored`)
        pushActivity(`Node ${n.name} errored`, "error")
      } else if (n.status === "stopped" && before === "running") {
        toast.warning(`Node ${n.name} went offline`)
        pushActivity(`Node ${n.name} went offline`, "warning")
      } else {
        toast.info(`Node ${n.name}: ${before} -> ${n.status}`)
        pushActivity(`Node ${n.name}: ${before} -> ${n.status}`, "info")
      }
    }
  }
  for (const [id] of prev) {
    if (!nextIds.has(id)) {
      toast.warning("Node removed from inventory", { description: id })
      pushActivity(`Node ${id} removed from inventory`, "warning")
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function DashboardOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [liveNodes, setLiveNodes] = useState<LiveNode[] | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const prevRef = useRef<Overview | null>(null)
  const prevNodesRef = useRef<Map<string, string>>(new Map())
  const firstLoad = useRef(true)
  const firstNodesSnapshot = useRef(true)
  const activityIdRef = useRef(0)

  const pushActivity = (message: string, type: ActivityEvent["type"]) => {
    setActivity((prev) => {
      const next = [
        { id: String(++activityIdRef.current), time: Date.now(), message, type },
        ...prev,
      ]
      return next.slice(0, 50)
    })
  }

  // Polling for server + online clients + bandwidth
  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch("/api/admin/overview", { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) setError(`overview failed (${res.status})`)
          return
        }
        const next = (await res.json()) as Overview
        if (cancelled) return
        setError(null)

        const prev = prevRef.current
        if (prev && !firstLoad.current) {
          emitServerClientDeltaToasts(prev, next, pushActivity)
        }
        firstLoad.current = false
        prevRef.current = next
        setData(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "overview failed")
      }
    }
    tick()
    const interval = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Realtime Firestore listener for nodes
  useEffect(() => {
    let unsub: (() => void) | null = null
    try {
      const db = clientFirestore()
      const q = query(collection(db, "nodes"), orderBy("createdAt", "desc"))
      unsub = onSnapshot(
        q,
        (snap: QuerySnapshot<DocumentData>) => {
          const nodes: LiveNode[] = snap.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>
            return {
              id: d.id,
              name: typeof raw.name === "string" ? raw.name : d.id,
              region: typeof raw.region === "string" ? raw.region : null,
              status: typeof raw.status === "string" ? raw.status : "unknown",
              hostname: typeof raw.hostname === "string" ? raw.hostname : "",
              tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
              provider: typeof raw.provider === "string" ? raw.provider : null,
              lastHeartbeatAt:
                typeof raw.lastHeartbeatAt === "number" ? raw.lastHeartbeatAt : null,
            }
          })
          if (!firstNodesSnapshot.current) {
            emitNodeDeltaToasts(prevNodesRef.current, nodes, pushActivity)
          }
          firstNodesSnapshot.current = false
          prevNodesRef.current = new Map(nodes.map((n) => [n.id, n.status]))
          setLiveNodes(nodes)
        },
        (err) => {
          setError((prev) => prev ?? `nodes snapshot: ${err.message}`)
        },
      )
    } catch {
      // firebase client not configured; polling fallback is enough
    }
    return () => {
      if (unsub) unsub()
    }
  }, [])

  const nodesSource = liveNodes ?? data?.nodes.items ?? []
  const totalNodes = nodesSource.length
  const onlineNodes = nodesSource.filter((n) => n.status === "running").length
  const connections = data?.online.available ? data.online.count : 0
  const isLive = liveNodes != null

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Unified operation dashboard &mdash; all modules, one view.
            {isLive ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
              </span>
            ) : null}
          </p>
          {error ? (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
        <ServerStatusPill overview={data} />
      </div>

      {/* ---- Workflow Pipeline ---- */}
      <WorkflowPipeline />

      {/* ---- Infrastructure Stats ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Nodes"
          value={data ? String(totalNodes) : "--"}
          description="Registered in inventory"
        />
        <StatCard
          title="Online Nodes"
          value={data ? String(onlineNodes) : "--"}
          description="Status: running"
          badge={
            onlineNodes > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                online
              </span>
            ) : null
          }
        />
        <StatCard
          title="Active Connections"
          value={data ? String(connections) : "--"}
          description={
            data?.online.available
              ? `${data.online.clients.length} unique client(s)`
              : "Traffic API unavailable"
          }
        />
        <StatCard
          title="Bandwidth"
          value={
            data?.bandwidth.available
              ? `${formatBytes(data.bandwidth.totalTx + data.bandwidth.totalRx)}`
              : "--"
          }
          description={
            data?.bandwidth.available
              ? `TX ${formatBytes(data.bandwidth.totalTx)} / RX ${formatBytes(data.bandwidth.totalRx)}`
              : "Traffic API unavailable"
          }
        />
      </div>

      {/* ---- Module Status Grid (grouped by stage) ---- */}
      <ModuleStatusGrid nodes={nodesSource} data={data} />

      {/* ---- Bottom row: Activity Feed + Nodes Health ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ActivityFeed events={activity} />
        <NodesHealthTable nodes={nodesSource} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Workflow Pipeline Visualization                                    */
/* ------------------------------------------------------------------ */

function WorkflowPipeline() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-0 overflow-x-auto">
          {WORKFLOW_STAGES.map((stage, i) => (
            <div key={stage.id} className="flex items-center">
              <div
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-4 py-2.5 text-center transition-colors hover:bg-accent/50",
                  stage.borderColor,
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-widest",
                    stage.color,
                  )}
                >
                  Phase {i + 1}
                </span>
                <span className="text-sm font-semibold whitespace-nowrap">
                  {stage.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {stage.modules.length} module{(stage.modules.length as number) !== 1 ? "s" : ""}
                </span>
              </div>
              {i < WORKFLOW_STAGES.length - 1 && (
                <div className="flex items-center px-1">
                  <div className="h-px w-6 bg-border" />
                  <svg
                    className="h-3 w-3 text-muted-foreground/50"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Module Status Grid                                                */
/* ------------------------------------------------------------------ */

function ModuleStatusGrid({
  nodes,
  data,
}: {
  nodes: LiveNode[]
  data: Overview | null
}) {
  const onlineNodes = nodes.filter((n) => n.status === "running").length
  const connections = data?.online.available ? data.online.count : 0

  /* Build status for each module -- real data where available, mock otherwise */
  const moduleStatus: Record<
    string,
    { status: "active" | "idle" | "error"; metric?: string }
  > = {
    "/admin/osint": { status: "idle", metric: "5 modules" },
    "/admin/network": { status: "idle", metric: "5 scans" },
    "/admin/threat": { status: "idle", metric: "5 feeds" },
    "/admin/nodes": {
      status: onlineNodes > 0 ? "active" : "idle",
      metric: `${onlineNodes}/${nodes.length} online`,
    },
    "/admin/transport": { status: "idle", metric: "4 protocols" },
    "/admin/configs": { status: "active", metric: "Generator ready" },
    "/admin/infrastructure": { status: "idle", metric: "Deployment" },
    "/admin/payloads": { status: "idle", metric: "5 templates" },
    "/admin/lotl": { status: "idle", metric: "5 tools" },
    "/admin/profiles": { status: "active", metric: "C2 profiles" },
    "/admin/mail": { status: "idle", metric: "Mail testing" },
    "/admin/agents": { status: "active", metric: "LLM tasks" },
    "/admin/coordination": { status: "idle", metric: "5 ops" },
    "/admin/forensics": { status: "idle", metric: "5 modules" },
    "/admin/ai": { status: "active", metric: "Chat ready" },
    "/admin/analytics": { status: "idle", metric: "5 modules" },
    "/admin/reports": { status: "idle", metric: "5 reports" },
  }

  /* If server is errored, mark infrastructure modules */
  if (data?.server.state === "errored") {
    moduleStatus["/admin/nodes"] = { status: "error", metric: "Server error" }
    moduleStatus["/admin/transport"] = { status: "error", metric: "Server error" }
  }

  /* If we have live connections, mark deliver as active */
  if (connections > 0) {
    moduleStatus["/admin/agents"] = { status: "active", metric: `${connections} conn` }
  }

  return (
    <div className="space-y-4">
      {WORKFLOW_STAGES.map((stage) => (
        <div key={stage.id}>
          <div className="mb-2 flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                stage.color.replace("text-", "bg-"),
              )}
            />
            <h3 className={cn("text-xs font-semibold uppercase tracking-wider", stage.color)}>
              {stage.label}
            </h3>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stage.modules.map((mod) => {
              const ms = moduleStatus[mod.href] ?? { status: "idle" as const }
              return (
                <Link key={mod.href} href={mod.href} className="group">
                  <Card className="transition-all group-hover:border-foreground/20 group-hover:shadow-md">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          ms.status === "active"
                            ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                            : ms.status === "error"
                              ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
                              : "bg-zinc-400 dark:bg-zinc-600",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight truncate">
                          {mod.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">
                          {ms.metric ?? mod.shortDesc}
                        </p>
                      </div>
                      <svg
                        className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */

function StatCard({
  title,
  value,
  description,
  badge,
}: {
  title: string
  value: string
  description: string
  badge?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between">
          <span>{title}</span>
          {badge}
        </CardDescription>
        <CardTitle className="text-3xl font-bold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{description}</CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Nodes Health Table                                                */
/* ------------------------------------------------------------------ */

function NodesHealthTable({ nodes }: { nodes: LiveNode[] }) {
  if (nodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nodes Health</CardTitle>
          <CardDescription>No nodes registered yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Nodes Health</CardTitle>
            <CardDescription>Status of registered Hysteria2 nodes</CardDescription>
          </div>
          <Link href="/admin/nodes">
            <Button variant="outline" size="sm">
              Manage
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[280px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{n.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {n.hostname}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                        stateTone(n.status),
                      )}
                    >
                      {n.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {timeAgo(n.lastHeartbeatAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Activity Feed                                                     */
/* ------------------------------------------------------------------ */

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const typeColor: Record<ActivityEvent["type"], string> = {
    info: "text-blue-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
    error: "text-red-500",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Real-time event feed from your infrastructure</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No activity yet. Events will appear here as they occur.
          </p>
        ) : (
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 text-sm">
                <span className={cn("mt-0.5 text-[10px]", typeColor[ev.type])}>
                  {"\u25CF"}
                </span>
                <span className="flex-1">{ev.message}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {new Date(ev.time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Server Status Pill (header inline)                                */
/* ------------------------------------------------------------------ */

function ServerStatusPill({ overview }: { overview: Overview | null }) {
  const state = overview?.server.state ?? "unknown"
  const tone = stateTone(state)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Server:</span>
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
          tone,
        )}
      >
        {state}
      </span>
      {overview?.server.pid ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          pid {overview.server.pid}
        </span>
      ) : null}
    </div>
  )
}
