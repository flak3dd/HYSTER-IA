"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { supabaseClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { WORKFLOW_STAGES } from "@/components/admin/sidebar"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  HardDrive,
  Monitor,
  Server,
  Shield,
  Signal,
  Wifi,
  WifiOff,
  Zap,
  ChevronRight,
} from "lucide-react"

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

/* ------------------------------------------------------------------ */
/*  Delta toast emitters (unchanged logic)                             */
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
      toast.info(`Client connected (+${delta})`, { description: `${next.online.count} online` })
      pushActivity(`+${delta} client(s) connected (${next.online.count} online)`, "info")
    } else if (delta < 0) {
      toast.info(`Client disconnected (${delta})`, { description: `${next.online.count} online` })
      pushActivity(`${delta} client(s) disconnected (${next.online.count} online)`, "info")
    }
  } else if (prev.online.available && !next.online.available) {
    toast.warning("Traffic stats API unavailable")
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
        toast.info(`Node registered: ${n.name}`)
        pushActivity(`Node ${n.name} registered (running)`, "info")
      }
      continue
    }
    if (before !== n.status) {
      if (n.status === "running") {
        toast.success(`Node ${n.name} went online`)
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
      toast.warning("Node removed from inventory")
      pushActivity(`Node ${id} removed`, "warning")
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function DashboardOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const prevRef = useRef<Overview | null>(null)
  const prevNodesRef = useRef<Map<string, string>>(new Map())
  const firstLoad = useRef(true)
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
          emitNodeDeltaToasts(prevNodesRef.current, next.nodes.items, pushActivity)
        }
        firstLoad.current = false
        prevRef.current = next
        prevNodesRef.current = new Map(next.nodes.items.map((n) => [n.id, n.status]))
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

  const fetchNodesNow = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" })
      if (!res.ok) return
      const next = (await res.json()) as Overview
      const prev = prevRef.current
      if (prev && !firstLoad.current) {
        emitServerClientDeltaToasts(prev, next, pushActivity)
        emitNodeDeltaToasts(prevNodesRef.current, next.nodes.items, pushActivity)
      }
      prevRef.current = next
      prevNodesRef.current = new Map(next.nodes.items.map((n) => [n.id, n.status]))
      setData(next)
    } catch {
      /* polling fallback */
    }
  }, [])

  useEffect(() => {
    const sb = supabaseClient()
    if (!sb) return
    const channel = sb
      .channel("nodes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "nodes" }, () => {
        fetchNodesNow()
      })
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }, [fetchNodesNow])

  const nodesSource = data?.nodes.items ?? []
  const totalNodes = nodesSource.length
  const onlineNodes = nodesSource.filter((n) => n.status === "running").length
  const connections = data?.online.available ? data.online.count : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header + Server Status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-xl">Command Center</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Unified operation dashboard — all modules, one view.
          </p>
          {error && (
            <div className="mt-2 flex items-center gap-2 text-body-sm text-destructive">
              <Circle className="h-2 w-2 fill-current" />
              {error}
            </div>
          )}
        </div>
        <ServerStatusPill overview={data} />
      </div>

      {/* KPI Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Server className="h-4 w-4" />}
          title="Total Nodes"
          value={data ? String(totalNodes) : "—"}
          subtitle="Registered in inventory"
          trend={null}
        />
        <KpiCard
          icon={<Signal className="h-4 w-4" />}
          title="Online Nodes"
          value={data ? String(onlineNodes) : "—"}
          subtitle={totalNodes > 0 ? `${Math.round((onlineNodes / totalNodes) * 100)}% uptime` : "No nodes"}
          trend={onlineNodes > 0 ? "positive" : null}
          badge={onlineNodes > 0 ? (
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-micro gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              live
            </Badge>
          ) : null}
        />
        <KpiCard
          icon={<Monitor className="h-4 w-4" />}
          title="Connections"
          value={data ? String(connections) : "—"}
          subtitle={
            data?.online.available
              ? `${data.online.clients.length} unique client(s)`
              : "Traffic API unavailable"
          }
          trend={null}
        />
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          title="Bandwidth"
          value={
            data?.bandwidth.available
              ? formatBytes(data.bandwidth.totalTx + data.bandwidth.totalRx)
              : "—"
          }
          subtitle={
            data?.bandwidth.available
              ? `↑ ${formatBytes(data.bandwidth.totalTx)} / ↓ ${formatBytes(data.bandwidth.totalRx)}`
              : "Traffic API unavailable"
          }
          trend={null}
        />
      </div>

      {/* Workflow Pipeline */}
      <WorkflowPipeline />

      {/* Quick Start */}
      <QuickStartGuide totalNodes={totalNodes} onlineNodes={onlineNodes} />



      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ActivityFeed events={activity} />
        <NodesHealthTable nodes={nodesSource} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI Card                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon,
  title,
  value,
  subtitle,
  trend,
  badge,
}: {
  icon: React.ReactNode
  title: string
  value: string
  subtitle: string
  trend: "positive" | "negative" | null
  badge?: React.ReactNode
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {badge}
        </div>
        <div className="mt-3">
          <p className="text-caption text-muted-foreground">{title}</p>
          <p className={cn(
            "mt-0.5 text-2xl font-bold tabular-nums tracking-tight",
            trend === "positive" && "text-success",
            trend === "negative" && "text-destructive",
          )}>
            {value}
          </p>
          <p className="mt-0.5 text-micro text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Workflow Pipeline                                                  */
/* ------------------------------------------------------------------ */

function WorkflowPipeline() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-heading-sm">Operation Pipeline</CardTitle>
        <CardDescription className="text-caption">
          Kill chain phases — Recon through Report
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {WORKFLOW_STAGES.map((stage, i) => {
            const StageIcon = stage.icon
            return (
              <div key={stage.id} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card px-5 py-3 text-center transition-all hover:border-border hover:bg-accent/50">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-white/5", stage.accentClass)}>
                    <StageIcon className="h-4 w-4" />
                  </div>
                  <span className={cn("text-micro font-bold tracking-widest uppercase", stage.accentClass)}>
                    Phase {i + 1}
                  </span>
                  <span className="text-body-sm font-medium whitespace-nowrap">{stage.label}</span>
                  <span className="text-micro text-muted-foreground">
                    {stage.modules.length} module{stage.modules.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <div className="flex items-center px-1.5">
                    <div className="h-px w-4 bg-border" />
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Quick Start Guide                                                 */
/* ------------------------------------------------------------------ */

const QUICK_START_STEPS = [
  {
    step: 1,
    title: "Deploy a node",
    description: "Register your first Hysteria2 node",
    href: "/admin/nodes",
    cta: "Manage Nodes",
    doneKey: "hasNodes" as const,
  },
  {
    step: 2,
    title: "Create a profile",
    description: "Set up a configuration template",
    href: "/admin/profiles",
    cta: "Manage Profiles",
    doneKey: "always" as const,
  },
  {
    step: 3,
    title: "Generate configs",
    description: "Produce subscription URLs",
    href: "/admin/configs",
    cta: "Config Generator",
    doneKey: "always" as const,
  },
  {
    step: 4,
    title: "Verify connectivity",
    description: "Check nodes are online",
    href: "/admin",
    cta: "View Dashboard",
    doneKey: "hasOnlineNodes" as const,
  },
] as const

function QuickStartGuide({ totalNodes, onlineNodes }: { totalNodes: number; onlineNodes: number }) {
  const checks = {
    hasNodes: totalNodes > 0,
    hasOnlineNodes: onlineNodes > 0,
    always: false,
  }
  const completedCount = QUICK_START_STEPS.filter((s) => checks[s.doneKey]).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-heading-sm">Quick Start</CardTitle>
            <CardDescription className="text-caption">
              Get operational in four steps
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-micro tabular-nums">
            {completedCount}/{QUICK_START_STEPS.length}
          </Badge>
        </div>
        <Progress
          value={(completedCount / QUICK_START_STEPS.length) * 100}
          className="mt-2 h-1.5"
        />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_START_STEPS.map((s) => {
            const done = checks[s.doneKey]
            return (
              <div
                key={s.step}
                className={cn(
                  "flex flex-col gap-2.5 rounded-xl border p-4 transition-all",
                  done
                    ? "border-success/20 bg-success/5"
                    : "border-border/50 hover:border-border",
                )}
              >
                <div className="flex items-center gap-2">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-micro text-muted-foreground">
                      {s.step}
                    </span>
                  )}
                  <span className="text-body-sm font-medium">{s.title}</span>
                </div>
                <p className="text-micro text-muted-foreground">{s.description}</p>
                <Link href={s.href} className="mt-auto">
                  <Button
                    variant={done ? "outline" : "default"}
                    size="xs"
                    className="w-full text-micro"
                  >
                    {s.cta}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Module Status Grid                                                */
/* ------------------------------------------------------------------ */

function ModuleStatusGrid({ nodes, data }: { nodes: LiveNode[]; data: Overview | null }) {
  const onlineNodes = nodes.filter((n) => n.status === "running").length
  const connections = data?.online.available ? data.online.count : 0

  const moduleStatus: Record<string, { status: "active" | "idle" | "error"; metric?: string }> = {
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
    "/admin/config-audit": { status: "idle", metric: "Audit tools" },
    "/admin/payloads": { status: "idle", metric: "5 templates" },
    "/admin/lotl": { status: "idle", metric: "5 tools" },
    "/admin/profiles": { status: "active", metric: "C2 profiles" },
    "/admin/mail": { status: "idle", metric: "Mail testing" },
    "/admin/mail/migrator": { status: "idle", metric: "IMAP migration" },
    "/admin/agents": { status: "active", metric: "LLM tasks" },
    "/admin/coordination": { status: "idle", metric: "5 ops" },
    "/admin/forensics": { status: "idle", metric: "5 modules" },
    "/admin/ai": { status: "active", metric: "Chat ready" },
    "/admin/workflow": { status: "idle", metric: "Orchestration" },
    "/admin/analytics": { status: "idle", metric: "5 modules" },
    "/admin/reports": { status: "idle", metric: "5 reports" },
  }

  if (data?.server.state === "errored") {
    moduleStatus["/admin/nodes"] = { status: "error", metric: "Server error" }
    moduleStatus["/admin/transport"] = { status: "error", metric: "Server error" }
  }
  if (connections > 0) {
    moduleStatus["/admin/agents"] = { status: "active", metric: `${connections} conn` }
  }

  return (
    <div className="space-y-5">
      {WORKFLOW_STAGES.map((stage) => (
        <div key={stage.id}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className={cn("h-2 w-2 rounded-full", stage.dotClass)} />
            <h3 className={cn("text-label", stage.accentClass)}>{stage.label}</h3>
            <Separator className="flex-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stage.modules.map((mod) => {
              const ms = moduleStatus[mod.href] ?? { status: "idle" as const }
              const ModIcon = mod.icon
              return (
                <Link key={mod.href} href={mod.href} className="group">
                  <Card className="transition-all group-hover:border-primary/20 group-hover:shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                        ms.status === "active"
                          ? "bg-success/10 text-success"
                          : ms.status === "error"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                      )}>
                        <ModIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-body-sm font-medium truncate">{mod.label}</p>
                        <p className="text-micro text-muted-foreground truncate">
                          {ms.metric ?? mod.shortDesc}
                        </p>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary" />
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
/*  Server Status Pill                                                */
/* ------------------------------------------------------------------ */

function ServerStatusPill({ overview }: { overview: Overview | null }) {
  const state = overview?.server.state ?? "unknown"

  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    running: { color: "border-success/30 bg-success/10 text-success", icon: <Wifi className="h-3 w-3" /> },
    starting: { color: "border-info/30 bg-info/10 text-info", icon: <Zap className="h-3 w-3" /> },
    stopping: { color: "border-warning/30 bg-warning/10 text-warning", icon: <Zap className="h-3 w-3" /> },
    errored: { color: "border-destructive/30 bg-destructive/10 text-destructive", icon: <WifiOff className="h-3 w-3" /> },
    stopped: { color: "border-border bg-muted text-muted-foreground", icon: <WifiOff className="h-3 w-3" /> },
    unknown: { color: "border-border bg-muted text-muted-foreground", icon: <HardDrive className="h-3 w-3" /> },
  }

  const c = config[state] ?? config.unknown

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-micro font-medium",
          c.color,
        )}
      >
          {c.icon}
          <span className="capitalize">{state}</span>
          {overview?.server.pid && (
            <span className="font-mono opacity-60">pid {overview.server.pid}</span>
          )}
      </TooltipTrigger>
      <TooltipContent>
        Hysteria2 server status
      </TooltipContent>
    </Tooltip>
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
          <CardTitle className="text-heading-sm">Nodes Health</CardTitle>
          <CardDescription className="text-caption">No nodes registered yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Server className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-body-sm font-medium">No nodes yet</p>
              <p className="text-caption text-muted-foreground">
                Deploy your first node to get started
              </p>
            </div>
            <Link href="/admin/nodes">
              <Button size="sm" variant="outline" className="text-caption">
                Add Node
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-heading-sm">Nodes Health</CardTitle>
            <CardDescription className="text-caption">
              {nodes.length} node{nodes.length !== 1 ? "s" : ""} registered
            </CardDescription>
          </div>
          <Link href="/admin/nodes">
            <Button variant="outline" size="xs" className="text-micro">
              Manage
              <ArrowUpRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px]">
          <div className="space-y-1">
            {nodes.map((n) => {
              const isOnline = n.status === "running"
              return (
                <div
                  key={n.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    isOnline ? "bg-success glow-success" : n.status === "errored" ? "bg-destructive glow-danger" : "bg-muted-foreground/30",
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium truncate">{n.name}</p>
                    <p className="font-mono text-micro text-muted-foreground truncate">
                      {n.hostname}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-micro capitalize",
                      isOnline
                        ? "border-success/30 text-success"
                        : n.status === "errored"
                          ? "border-destructive/30 text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {n.status}
                  </Badge>
                  <span className="text-micro tabular-nums text-muted-foreground">
                    {timeAgo(n.lastHeartbeatAt)}
                  </span>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Activity Feed                                                     */
/* ------------------------------------------------------------------ */

const EVENT_CONFIG: Record<ActivityEvent["type"], { dot: string; icon: React.ReactNode }> = {
  info: { dot: "bg-blue-400", icon: <Circle className="h-1.5 w-1.5 fill-blue-400 text-blue-400" /> },
  success: { dot: "bg-success", icon: <Circle className="h-1.5 w-1.5 fill-success text-success" /> },
  warning: { dot: "bg-warning", icon: <Circle className="h-1.5 w-1.5 fill-warning text-warning" /> },
  error: { dot: "bg-destructive", icon: <Circle className="h-1.5 w-1.5 fill-destructive text-destructive" /> },
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-heading-sm">Recent Activity</CardTitle>
            <CardDescription className="text-caption">
              Real-time event feed
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-micro tabular-nums">
            {events.length} events
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Activity className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-body-sm font-medium">No activity yet</p>
              <p className="text-caption text-muted-foreground">
                Events will appear here as they occur
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-1">
              {events.map((ev) => {
                const cfg = EVENT_CONFIG[ev.type]
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <span className="mt-1.5">{cfg.icon}</span>
                    <span className="flex-1 text-body-sm">{ev.message}</span>
                    <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                      {new Date(ev.time).toLocaleTimeString()}
                    </span>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
