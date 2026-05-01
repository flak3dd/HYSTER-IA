"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { supabaseClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Monitor, Shield, Signal } from "lucide-react"
import {
  type Overview,
  type LiveNode,
  type ActivityEvent,
  KpiCard,
  WorkflowPipeline,
  QuickStartGuide,
  ModuleStatusGrid,
  ServerStatusPill,
  NodesHealthTable,
  ActivityFeed,
} from "@/components/admin/dashboard/dashboard-widgets"

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

