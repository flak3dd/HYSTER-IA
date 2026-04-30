'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface AnalyticsData {
  overview: {
    totalSessions: number
    completedSessions: number
    failedSessions: number
    successRate: number
    stepsPerSession: number
    avgCompletionTime: number
  }
  functionUsage: Array<{ name: string; count: number }>
  categoryUsage: Record<string, number>
  recentActivity: {
    total: number
    completed: number
    failed: number
  }
  topWorkflows: Array<{
    id: string
    status: string
    stepCount: number
    createdAt: string
    workflowType: string
  }>
}

export function WorkflowAnalytics() {
  const [isOpen, setIsOpen] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/workflow/analytics')
      if (!response.ok) throw new Error('Failed to load analytics')
      
      const data = await response.json()
      setAnalytics(data.analytics)
    } catch (error) {
      console.error('Error loading analytics:', error)
      toast.error('Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadAnalytics()
    }
  }, [isOpen])

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="gap-2" />}
      >
        <BarChart3 className="h-4 w-4" />
        Analytics
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Workflow Analytics & Insights</DialogTitle>
          <DialogDescription>
            Learn from your past workflow sessions and usage patterns
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : analytics ? (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="text-2xl font-bold">{analytics.overview.totalSessions}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Total Sessions</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-2xl font-bold">{analytics.overview.completedSessions}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    <span className="text-2xl font-bold">{analytics.overview.successRate}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <span className="text-2xl font-bold">{analytics.overview.avgCompletionTime}s</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Avg Time</p>
                </CardContent>
              </Card>
            </div>

            {/* Function Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most Used Functions</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.functionUsage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No function usage data yet</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.functionUsage.map((func, index) => (
                      <div key={func.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                          <span className="text-sm font-mono">{func.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all"
                              style={{ 
                                width: `${(func.count / analytics.functionUsage[0].count) * 100}%` 
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {func.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity (7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{analytics.recentActivity.total}</div>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-500">{analytics.recentActivity.completed}</div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-500">{analytics.recentActivity.failed}</div>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Workflows */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Workflows</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.topWorkflows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent workflows</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.topWorkflows.map((workflow) => (
                      <div key={workflow.id} className="flex items-center justify-between p-2 rounded hover:bg-muted">
                        <div className="flex items-center gap-3">
                          <Badge 
                            variant="outline" 
                            className={
                              workflow.status === 'completed' 
                                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                : workflow.status === 'failed'
                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            }
                          >
                            {workflow.status}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium">{workflow.workflowType || 'Untitled'}</p>
                            <p className="text-xs text-muted-foreground">
                              {workflow.stepCount} steps • {formatDate(workflow.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">💡 Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {analytics.overview.successRate > 80 && (
                    <p className="text-green-600">✅ Your workflows are running smoothly! Keep up the good work.</p>
                  )}
                  {analytics.overview.successRate < 60 && analytics.overview.totalSessions > 5 && (
                    <p className="text-yellow-600">⚠️ Consider breaking complex workflows into smaller steps for better reliability.</p>
                  )}
                  {analytics.overview.stepsPerSession > 5 && (
                    <p className="text-blue-600">📊 Your workflows tend to be complex. Templates might help streamline common operations.</p>
                  )}
                  {analytics.functionUsage.length > 0 && (
                    <p className="text-purple-600">🔥 Most used function: <strong>{analytics.functionUsage[0].name}</strong></p>
                  )}
                  {analytics.recentActivity.total === 0 && (
                    <p className="text-muted-foreground">No recent activity. Start a new workflow to see insights here.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}