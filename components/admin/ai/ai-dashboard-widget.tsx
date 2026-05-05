"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api/fetch"
import {
  Bot,
  ShieldAlert,
  Sparkles,
  Zap,
  Activity,
  ChevronRight,
  MessageSquarePlus,
  Wrench,
  TrendingUp,
  RefreshCw,
  Cpu,
  CheckCircle2,
  XCircle,
  Power,
  PowerOff,
} from "lucide-react"

type AIStats = {
  totalConversations: number
  activeAgents: number
  totalExecutions: number
  successRate: number
}

type RecentActivity = {
  type: "chat" | "shadowgrok"
  message: string
  time: string
  status: "success" | "warning" | "error"
}

type AIStatsResponse = {
  stats: AIStats
  recentActivity: RecentActivity[]
}

type AISystemStatus = {
  initialized: boolean
  systems: {
    scheduler: boolean
    selfOptimization: boolean
    predictiveCaching: boolean
    threatCorrelation: boolean
    anomalyDetection: boolean
  }
  config: {
    enableTaskScheduling: boolean
    enableSelfOptimization: boolean
    enablePredictiveCaching: boolean
    enableThreatCorrelation: boolean
    enableAnomalyDetection: boolean
    optimizationInterval: number
  }
}

const QUICK_ACTIONS = [
  {
    icon: Bot,
    label: "AI Chat",
    description: "Start conversation",
    href: "/admin/ai",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  {
    icon: ShieldAlert,
    label: "ShadowGrok",
    description: "C2 operations",
    href: "/admin/ai",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
  },
  {
    icon: Sparkles,
    label: "Templates",
    description: "Quick prompts",
    href: "/admin/ai",
    color: "text-info",
    bg: "bg-info/10",
    border: "border-info/20",
  },
]

export function AIDashboardWidget() {
  const [stats, setStats] = useState<AIStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [aiSystemStatus, setAiSystemStatus] = useState<AISystemStatus | null>(null)
  const [aiSystemLoading, setAiSystemLoading] = useState(true)

  const fetchStats = async () => {
    try {
      const res = await apiFetch("/api/admin/ai/stats")
      if (res.ok) {
        const data: AIStatsResponse = await res.json()
        setStats(data.stats)
        setRecentActivity(data.recentActivity)
      }
    } catch (error) {
      console.error("Failed to fetch AI stats:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchAISystemStatus = async () => {
    try {
      const res = await apiFetch("/api/admin/ai/autonomous?type=initializer")
      if (res.ok) {
        const data = await res.json()
        setAiSystemStatus(data)
      }
    } catch (error) {
      console.error("Failed to fetch AI system status:", error)
    } finally {
      setAiSystemLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchAISystemStatus()
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    const aiInterval = setInterval(fetchAISystemStatus, 60000) // Refresh AI status every minute
    return () => {
      clearInterval(interval)
      clearInterval(aiInterval)
    }
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchStats()
    fetchAISystemStatus()
  }

  const handleInitializeAI = async () => {
    try {
      setAiSystemLoading(true)
      const res = await apiFetch("/api/admin/ai/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initialize" }),
      })
      if (res.ok) {
        await fetchAISystemStatus()
      }
    } catch (error) {
      console.error("Failed to initialize AI systems:", error)
    } finally {
      setAiSystemLoading(false)
    }
  }

  const handleShutdownAI = async () => {
    try {
      setAiSystemLoading(true)
      const res = await apiFetch("/api/admin/ai/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shutdown" }),
      })
      if (res.ok) {
        await fetchAISystemStatus()
      }
    } catch (error) {
      console.error("Failed to shutdown AI systems:", error)
    } finally {
      setAiSystemLoading(false)
    }
  }

  return (
    <Card className="shadow-lg shadow-primary/5 border-primary/20 overflow-hidden">
      <CardHeader className="bg-gradient-to-b from-primary/5 to-transparent pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <div className="relative">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary glow-primary" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-success ring-2 ring-background">
                <Activity className="h-2 w-2 text-success-foreground" />
              </div>
            </div>
            AI Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-micro text-primary hover:text-primary hover:bg-primary/10"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            </Button>
            <Link href="/admin/ai">
              <Button variant="ghost" size="sm" className="gap-1 text-micro text-primary hover:text-primary hover:bg-primary/10">
                View All
                <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* AI System Status */}
        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-label text-muted-foreground">
              <Cpu className="h-3 w-3" />
              <span>AI Systems</span>
            </div>
            {aiSystemLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : aiSystemStatus ? (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 px-1.5 text-micro",
                    aiSystemStatus.initialized
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-warning/30 bg-warning/10 text-warning"
                  )}
                >
                  {aiSystemStatus.initialized ? (
                    <>
                      <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                      Active
                    </>
                  ) : (
                    <>
                      <XCircle className="h-2.5 w-2.5 mr-1" />
                      Inactive
                    </>
                  )}
                </Badge>
                {aiSystemStatus.initialized ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleShutdownAI}
                    disabled={aiSystemLoading}
                    title="Shutdown AI systems"
                  >
                    <PowerOff className="h-3 w-3 text-destructive" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleInitializeAI}
                    disabled={aiSystemLoading}
                    title="Initialize AI systems"
                  >
                    <Power className="h-3 w-3 text-success" />
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          {aiSystemLoading ? (
            <div className="flex gap-1">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ) : aiSystemStatus ? (
            <div className="flex gap-1 flex-wrap">
              {Object.entries(aiSystemStatus.systems).map(([key, enabled]) => (
                <Badge
                  key={key}
                  variant="outline"
                  className={cn(
                    "h-5 px-1.5 text-micro",
                    enabled
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-muted/30 bg-muted/10 text-muted-foreground"
                  )}
                >
                  {key === 'scheduler' && 'Scheduler'}
                  {key === 'selfOptimization' && 'Optimization'}
                  {key === 'predictiveCaching' && 'Caching'}
                  {key === 'threatCorrelation' && 'Threats'}
                  {key === 'anomalyDetection' && 'Anomalies'}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {loading ? (
            <>
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </>
          ) : stats ? (
            <>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <Bot className="h-3 w-3" />
                  <span>Conversations</span>
                </div>
                <div className="text-heading-lg text-foreground">{stats.totalConversations}</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <Zap className="h-3 w-3" />
                  <span>Executions</span>
                </div>
                <div className="text-heading-lg text-foreground">{stats.totalExecutions}</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <Activity className="h-3 w-3" />
                  <span>Active Agents</span>
                </div>
                <div className="text-heading-lg text-foreground">{stats.activeAgents}</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>Success Rate</span>
                </div>
                <div className="text-heading-lg text-success">{stats.successRate}%</div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <Bot className="h-3 w-3" />
                  <span>Conversations</span>
                </div>
                <div className="text-heading-lg text-muted-foreground">-</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <Zap className="h-3 w-3" />
                  <span>Executions</span>
                </div>
                <div className="text-heading-lg text-muted-foreground">-</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <Activity className="h-3 w-3" />
                  <span>Active Agents</span>
                </div>
                <div className="text-heading-lg text-muted-foreground">-</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 text-micro text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>Success Rate</span>
                </div>
                <div className="text-heading-lg text-muted-foreground">-</div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-label text-muted-foreground">
            <Wrench className="h-3 w-3" />
            Quick Actions
          </div>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <Link key={action.label} href={action.href}>
                  <div className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all",
                    "hover:shadow-lg hover:shadow-primary/5 hover:scale-105",
                    action.bg, action.border
                  )}>
                    <Icon className={cn("h-4 w-4", action.color)} />
                    <span className="text-micro font-medium text-foreground">{action.label}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-label text-muted-foreground">
              <Activity className="h-3 w-3" />
              Recent Activity
            </div>
            <Badge variant="outline" className="h-5 px-1.5 text-micro border-success/30 bg-success/10 text-success">
              Live
            </Badge>
          </div>
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="space-y-1.5">
              {recentActivity.slice(0, 3).map((activity, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                  <div className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    activity.status === "success" ? "bg-success" : activity.status === "warning" ? "bg-warning" : "bg-destructive"
                  )} />
                  <span className="flex-1 text-micro text-foreground truncate">{activity.message}</span>
                  <span className="text-micro text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-muted-foreground text-center py-4">
              No recent activity
            </div>
          )}
        </div>

        {/* CTA Button */}
        <Link href="/admin/ai">
          <Button className="w-full gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
            <MessageSquarePlus className="h-4 w-4" />
            Start New Conversation
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}