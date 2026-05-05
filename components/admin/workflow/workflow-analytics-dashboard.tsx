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
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
  RefreshCw,
  Calendar,
} from "lucide-react"

type WorkflowMetrics = {
  totalWorkflows: number
  completedWorkflows: number
  failedWorkflows: number
  runningWorkflows: number
  avgExecutionTime: number
  successRate: number
  popularWorkflows: Array<{
    name: string
    count: number
    avgTime: number
  }>
  recentActivity: Array<{
    id: string
    type: string
    status: string
    timestamp: string
    duration?: number
  }>
  timeSeriesData: Array<{
    date: string
    completed: number
    failed: number
    avgTime: number
  }>
}

export function WorkflowAnalyticsDashboard() {
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("7d")

  const fetchMetrics = async () => {
    try {
      const res = await apiFetch(`/api/admin/workflow/analytics?range=${timeRange}`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
      }
    } catch (error) {
      console.error("Failed to fetch workflow analytics:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [timeRange])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchMetrics()
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Time Range:</span>
          <div className="flex gap-1">
            {(["7d", "30d", "90d"] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setTimeRange(range)}
              >
                {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
              </Button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-micro text-muted-foreground">
                    <Activity className="h-3 w-3" />
                    <span>Total Workflows</span>
                  </div>
                  <Badge variant="outline" className="h-5 px-1.5 text-micro border-border/30 bg-muted/10">
                    {metrics?.totalWorkflows || 0}
                  </Badge>
                </div>
                <div className="text-heading-lg text-foreground">
                  {metrics?.completedWorkflows || 0} completed
                </div>
                <div className="text-micro text-muted-foreground mt-1">
                  {metrics?.runningWorkflows || 0} running
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-micro text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Success Rate</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-5 px-1.5 text-micro",
                      (metrics?.successRate || 0) >= 90
                        ? "border-success/30 bg-success/10 text-success"
                        : (metrics?.successRate || 0) >= 70
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {metrics?.successRate || 0}%
                  </Badge>
                </div>
                <div className="text-heading-lg text-foreground">
                  {metrics?.completedWorkflows || 0}
                </div>
                <div className="text-micro text-muted-foreground mt-1">
                  {metrics?.failedWorkflows || 0} failed
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-micro text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Avg Duration</span>
                  </div>
                  <Badge variant="outline" className="h-5 px-1.5 text-micro border-border/30 bg-muted/10">
                    <TrendingUp className="h-2.5 w-2.5" />
                  </Badge>
                </div>
                <div className="text-heading-lg text-foreground">
                  {metrics?.avgExecutionTime || 0}s
                </div>
                <div className="text-micro text-muted-foreground mt-1">
                  Across all workflows
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-micro text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    <span>Efficiency</span>
                  </div>
                  <Badge variant="outline" className="h-5 px-1.5 text-micro border-border/30 bg-muted/10">
                    <BarChart3 className="h-2.5 w-2.5" />
                  </Badge>
                </div>
                <div className="text-heading-lg text-foreground">
                  {(metrics?.successRate || 0) > 80 ? "High" : (metrics?.successRate || 0) > 60 ? "Medium" : "Low"}
                </div>
                <div className="text-micro text-muted-foreground mt-1">
                  Based on success rate
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Workflows */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-heading-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Popular Workflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {loading ? (
                  <>
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </>
                ) : metrics?.popularWorkflows && metrics.popularWorkflows.length > 0 ? (
                  metrics.popularWorkflows.map((workflow, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-body-sm font-medium truncate">{workflow.name}</div>
                        <div className="text-micro text-muted-foreground">
                          {workflow.count} executions
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-body-sm text-foreground">{workflow.avgTime}s</div>
                        <div className="text-micro text-muted-foreground">avg time</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-micro text-muted-foreground text-center py-8">
                    No workflow data available
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-heading-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1.5">
                {loading ? (
                  <>
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </>
                ) : metrics?.recentActivity && metrics.recentActivity.length > 0 ? (
                  metrics.recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      {activity.status === "completed" ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : activity.status === "failed" ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Clock className="h-3 w-3 text-warning" />
                      )}
                      <span className="flex-1 text-micro text-foreground truncate">
                        {activity.type}
                      </span>
                      {activity.duration && (
                        <span className="text-micro text-muted-foreground">{activity.duration}s</span>
                      )}
                      <span className="text-micro text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-micro text-muted-foreground text-center py-8">
                    No recent activity
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