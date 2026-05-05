"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  ChevronDown,
  ChevronRight,
  Brain,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  Zap,
} from "lucide-react"

type ReasoningEvent = {
  type: string
  timestamp: number
  data: Record<string, unknown>
}

type ReasoningTrace = {
  sessionId: string
  startTime: number
  endTime?: number
  events: ReasoningEvent[]
  errors: Array<{ message: string; timestamp: number; context?: Record<string, unknown> }>
}

type ReasoningTraceViewProps = {
  trace: ReasoningTrace | null
  loading?: boolean
}

export function ReasoningTraceView({ trace, loading }: ReasoningTraceViewProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Reasoning Trace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 animate-pulse bg-muted rounded" />
            <div className="h-8 animate-pulse bg-muted rounded" />
            <div className="h-8 animate-pulse bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!trace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Reasoning Trace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-micro text-muted-foreground text-center py-8">
            No reasoning trace available
          </div>
        </CardContent>
      </Card>
    )
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "execution_start":
      case "step_start":
        return <Activity className="h-3 w-3 text-info" />
      case "chain_of_thought":
        return <Brain className="h-3 w-3 text-primary" />
      case "meta_cognition":
        return <Zap className="h-3 w-3 text-warning" />
      case "tool_execution":
        return <CheckCircle2 className="h-3 w-3 text-success" />
      case "low_confidence_warning":
        return <AlertTriangle className="h-3 w-3 text-warning" />
      case "execution_complete":
        return <CheckCircle2 className="h-3 w-3 text-success" />
      case "execution_failed":
        return <XCircle className="h-3 w-3 text-destructive" />
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case "execution_start":
      case "step_start":
        return "border-info/30 bg-info/10 text-info"
      case "chain_of_thought":
        return "border-primary/30 bg-primary/10 text-primary"
      case "meta_cognition":
        return "border-warning/30 bg-warning/10 text-warning"
      case "tool_execution":
        return "border-success/30 bg-success/10 text-success"
      case "low_confidence_warning":
        return "border-warning/30 bg-warning/10 text-warning"
      case "execution_complete":
        return "border-success/30 bg-success/10 text-success"
      case "execution_failed":
        return "border-destructive/30 bg-destructive/10 text-destructive"
      default:
        return "border-border/30 bg-muted/10 text-muted-foreground"
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  const getDuration = () => {
    if (!trace.endTime) return null
    const duration = trace.endTime - trace.startTime
    return `${(duration / 1000).toFixed(2)}s`
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Reasoning Trace
          </CardTitle>
          <div className="flex items-center gap-2">
            {getDuration() && (
              <Badge variant="outline" className="h-5 px-1.5 text-micro border-border/30 bg-muted/10">
                {getDuration()}
              </Badge>
            )}
            <Badge variant="outline" className="h-5 px-1.5 text-micro border-border/30 bg-muted/10">
              {trace.events.length} events
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {trace.events.map((event, index) => {
              const eventId = `${index}-${event.type}`
              const isExpanded = expandedEvents.has(eventId)
              const hasDetails = Object.keys(event.data).length > 0

              return (
                <Collapsible key={eventId} open={isExpanded} onOpenChange={() => toggleEvent(eventId)}>
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border p-2.5 transition-all",
                      "hover:bg-muted/50",
                      getEventColor(event.type)
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getEventIcon(event.type)}
                      <span className="text-micro font-medium truncate">{event.type}</span>
                      <span className="text-micro text-muted-foreground ml-auto">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    {hasDetails && (
                      isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )
                    )}
                  </CollapsibleTrigger>
                  {hasDetails && (
                    <CollapsibleContent className="mt-1 ml-6">
                      <div className="rounded-lg bg-muted/50 border border-border/50 p-2">
                        <pre className="text-micro font-mono overflow-x-auto">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              )
            })}
          </div>

          {trace.errors.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-label text-destructive flex items-center gap-2">
                <XCircle className="h-3 w-3" />
                Errors ({trace.errors.length})
              </div>
              {trace.errors.map((error, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5"
                >
                  <div className="flex items-center gap-2 text-micro text-destructive mb-1">
                    <XCircle className="h-3 w-3" />
                    <span className="font-medium">{error.message}</span>
                    <span className="ml-auto text-muted-foreground">
                      {formatTimestamp(error.timestamp)}
                    </span>
                  </div>
                  {error.context && (
                    <pre className="text-micro font-mono mt-1 text-muted-foreground">
                      {JSON.stringify(error.context, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}