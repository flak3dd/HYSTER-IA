"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api/fetch"
import {
  ArrowRightLeft,
  Activity,
  Globe,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Route,
  MapPin,
  TrendingUp,
  TrendingDown,
  Clock,
} from "lucide-react"

type TrafficStatus = {
  isActive: boolean
  currentRoute: string | null
  activeNodes: number
  totalNodes: number
  bandwidth: {
    current: number
    peak: number
    unit: string
  }
  latency: {
    avg: number
    p95: number
    p99: number
  }
  successRate: number
  lastFailover: string | null
}

type RouteLog = {
  id: string
  timestamp: string
  source: string
  destination: string
  status: "success" | "failed" | "failover"
  latency: number
  bandwidth: number
}

type TrafficRoute = {
  id: string
  name: string
  region: string
  status: "active" | "inactive" | "degraded"
  capacity: number
  currentLoad: number
  latency: number
}

export function TrafficDashboard() {
  const [status, setStatus] = useState<TrafficStatus | null>(null)
  const [routes, setRoutes] = useState<TrafficRoute[]>([])
  const [logs, setLogs] = useState<RouteLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTrafficStatus = async () => {
    try {
      const res = await apiFetch("/api/admin/infrastructure/traffic")
      if (res.ok) {
        const data = await res.json()
        setStatus(data.status)
        setRoutes(data.routes || [])
        setLogs(data.logs || [])
      }
    } catch (error) {
      console.error("Failed to fetch traffic status:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchTrafficStatus()
    const interval = setInterval(fetchTrafficStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchTrafficStatus()
  }

  const handleRouteTraffic = async (routeId: string) => {
    try {
      const res = await apiFetch("/api/admin/infrastructure/traffic/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId }),
      })
      if (res.ok) {
        await fetchTrafficStatus()
      }
    } catch (error) {
      console.error("Failed to route traffic:", error)
    }
  }

  const handleCleanup = async () => {
    try {
      const res = await apiFetch("/api/admin/infrastructure/traffic/cleanup", {
        method: "DELETE",
      })
      if (res.ok) {
        await fetchTrafficStatus()
      }
    } catch (error) {
      console.error("Failed to cleanup routes:", error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-micro text-muted-foreground">
                    <Activity className="h-3 w-3" />
                    <span>Status</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-5 px-1.5 text-micro",
                      status?.isActive
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-warning/30 bg-warning/10 text-warning"
                    )}
                  >
                    {status?.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="text-heading-lg text-foreground">
                  {status?.activeNodes} / {status?.totalNodes} Nodes
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-2">
                  <TrendingUp className="h-3 w-3" />
                  <span>Bandwidth</span>
                </div>
                <div className="text-heading-lg text-foreground">
                  {status?.bandwidth.current} {status?.bandwidth.unit}
                </div>
                <div className="text-micro text-muted-foreground">
                  Peak: {status?.bandwidth.peak} {status?.bandwidth.unit}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-2">
                  <Clock className="h-3 w-3" />
                  <span>Latency</span>
                </div>
                <div className="text-heading-lg text-foreground">
                  {status?.latency.avg}ms
                </div>
                <div className="text-micro text-muted-foreground">
                  P95: {status?.latency.p95}ms
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-2">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Success Rate</span>
                </div>
                <div className="text-heading-lg text-success">
                  {status?.successRate}%
                </div>
                {status?.lastFailover && (
                  <div className="text-micro text-muted-foreground mt-1">
                    Last failover: {new Date(status.lastFailover).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Routes and Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Routes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <Route className="h-4 w-4" />
                Active Routes
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-micro"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {loading ? (
                  <>
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </>
                ) : routes.length > 0 ? (
                  routes.map((route) => (
                    <div
                      key={route.id}
                      className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full",
                            route.status === "active"
                              ? "bg-success"
                              : route.status === "degraded"
                              ? "bg-warning"
                              : "bg-muted"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-body-sm font-medium truncate">{route.name}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-4 px-1 text-micro",
                                route.status === "active"
                                  ? "border-success/30 bg-success/10 text-success"
                                  : route.status === "degraded"
                                  ? "border-warning/30 bg-warning/10 text-warning"
                                  : "border-muted/30 bg-muted/10 text-muted-foreground"
                              )}
                            >
                              {route.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-micro text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {route.region}
                            </span>
                            <span className="flex items-center gap-1">
                              <Activity className="h-2.5 w-2.5" />
                              {route.latency}ms
                            </span>
                            <span className="flex items-center gap-1">
                              <Server className="h-2.5 w-2.5" />
                              {route.currentLoad}/{route.capacity}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2"
                        onClick={() => handleRouteTraffic(route.id)}
                        disabled={!status?.isActive}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-micro text-muted-foreground text-center py-8">
                    No active routes
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Traffic Logs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Traffic Logs
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-micro"
                onClick={handleCleanup}
                disabled={loading}
              >
                Cleanup
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-1.5">
                {loading ? (
                  <>
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                  </>
                ) : logs.length > 0 ? (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : log.status === "failed" ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-warning" />
                      )}
                      <span className="flex-1 text-micro text-foreground truncate">
                        {log.source} → {log.destination}
                      </span>
                      <span className="text-micro text-muted-foreground">{log.latency}ms</span>
                      <span className="text-micro text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-micro text-muted-foreground text-center py-8">
                    No traffic logs
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}