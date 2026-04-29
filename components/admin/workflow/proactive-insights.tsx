'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Brain, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Lightbulb, 
  Zap,
  TrendingUp,
  Activity,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

interface Anomaly {
  isAnomaly: boolean
  severity: 'low' | 'medium' | 'high'
  type: string
  description: string
  suggestedActions: string[]
  confidence: number
}

interface Suggestion {
  type: 'workflow' | 'optimization' | 'preventive' | 'insight'
  priority: 'low' | 'medium' | 'high'
  title: string
  description: string
  suggestedAction: string
  expectedBenefit: string
  confidence: number
  basedOn: string[]
}

interface HealthCheck {
  overallHealth: 'healthy' | 'degraded' | 'critical'
  anomalies: Anomaly[]
  suggestions: Suggestion[]
  metrics: {
    timestamp: number
    errorRate: number
    responseTime: number
    throughput: number
  }
}

interface ProactiveInsightsProps {
  isOpen: boolean
  onClose: () => void
}

export function ProactiveInsights({ isOpen, onClose }: ProactiveInsightsProps) {
  const [healthCheck, setHealthCheck] = useState<HealthCheck | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadHealthCheck()
    }
  }, [isOpen])

  const loadHealthCheck = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/workflow/proactive')
      if (!response.ok) throw new Error('Failed to load health check')
      const data = await response.json()
      setHealthCheck(data)
    } catch (error) {
      console.error('Error loading health check:', error)
      toast.error('Failed to load proactive insights')
    } finally {
      setIsLoading(false)
    }
  }

  const getHealthIcon = () => {
    if (!healthCheck) return <Activity className="h-5 w-5" />
    
    switch (healthCheck.overallHealth) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />
    }
  }

  const getHealthColor = () => {
    if (!healthCheck) return 'bg-gray-500/10 text-gray-500'
    
    switch (healthCheck.overallHealth) {
      case 'healthy':
        return 'bg-green-500/10 text-green-500 border-green-500/20'
      case 'degraded':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
      case 'critical':
        return 'bg-red-500/10 text-red-500 border-red-500/20'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
      case 'high':
        return 'bg-red-500/10 text-red-500 border-red-500/20'
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-blue-500/10 text-blue-500'
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-500'
      case 'high':
        return 'bg-red-500/10 text-red-500'
      default:
        return 'bg-gray-500/10 text-gray-500'
    }
  }

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'workflow':
        return <Activity className="h-4 w-4" />
      case 'optimization':
        return <Zap className="h-4 w-4" />
      case 'preventive':
        return <AlertTriangle className="h-4 w-4" />
      case 'insight':
        return <Lightbulb className="h-4 w-4" />
      default:
        return <Brain className="h-4 w-4" />
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Proactive Intelligence</CardTitle>
                <CardDescription>AI-powered system insights and recommendations</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={getHealthColor()}>
                {getHealthIcon()}
                <span className="ml-1 capitalize">{healthCheck?.overallHealth || 'Unknown'}</span>
              </Badge>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Activity className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analyzing system patterns...</p>
              </div>
            </div>
          ) : healthCheck ? (
            <div className="space-y-6">
              {/* System Metrics */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  System Metrics
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Error Rate</p>
                    <p className="text-2xl font-bold">{(healthCheck.metrics.errorRate * 100).toFixed(1)}%</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Response Time</p>
                    <p className="text-2xl font-bold">{healthCheck.metrics.responseTime.toFixed(0)}ms</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Throughput</p>
                    <p className="text-2xl font-bold">{healthCheck.metrics.throughput.toFixed(1)}/h</p>
                  </div>
                </div>
              </div>

              {/* Anomalies */}
              {healthCheck.anomalies.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Detected Anomalies ({healthCheck.anomalies.length})
                  </h3>
                  <div className="space-y-3">
                    {healthCheck.anomalies.map((anomaly, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={getSeverityColor(anomaly.severity)}>
                              {anomaly.severity}
                            </Badge>
                            <span className="font-medium">{anomaly.type}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {(anomaly.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <p className="text-sm mb-2">{anomaly.description}</p>
                        <div className="text-sm">
                          <p className="font-medium mb-1">Suggested Actions:</p>
                          <ul className="list-disc list-inside text-muted-foreground">
                            {anomaly.suggestedActions.map((action, i) => (
                              <li key={i}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {healthCheck.suggestions.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    AI Suggestions ({healthCheck.suggestions.length})
                  </h3>
                  <div className="space-y-3">
                    {healthCheck.suggestions.map((suggestion, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getSuggestionIcon(suggestion.type)}
                            <span className="font-medium">{suggestion.title}</span>
                            <Badge variant="outline" className={getPriorityColor(suggestion.priority)}>
                              {suggestion.priority}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {(suggestion.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <p className="text-sm mb-2">{suggestion.description}</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium mb-1">Suggested Action:</p>
                            <p className="text-muted-foreground">{suggestion.suggestedAction}</p>
                          </div>
                          <div>
                            <p className="font-medium mb-1">Expected Benefit:</p>
                            <p className="text-muted-foreground">{suggestion.expectedBenefit}</p>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Based on: {suggestion.basedOn.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Issues */}
              {healthCheck.anomalies.length === 0 && healthCheck.suggestions.length === 0 && (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-semibold mb-2">All Systems Optimal</h3>
                  <p className="text-muted-foreground">No anomalies or suggestions detected. System is performing within normal parameters.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No health check data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}