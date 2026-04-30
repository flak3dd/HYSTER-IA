"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  Bot,
  CircleStop,
  Loader2,
  MessageSquare,
  Terminal,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
} from "lucide-react"
import type { AgentStep, AgentTask, AgentTaskStatus } from "@/lib/agents/types"

export function TaskDetail({
  taskId,
  initialTask,
  initialSteps,
}: {
  taskId: string
  initialTask: AgentTask
  initialSteps: AgentStep[]
}) {
  const [status, setStatus] = useState<AgentTaskStatus>(initialTask.status)
  const [stepMap, setStepMap] = useState<Map<number, AgentStep>>(
    () => new Map(initialSteps.map((s) => [s.index, s])),
  )
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (status !== "queued" && status !== "running") return
    const es = new EventSource(`/api/admin/agents/tasks/${taskId}/stream`)
    es.addEventListener("step", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { step: AgentStep }
      setStepMap((prev) => {
        const next = new Map(prev)
        next.set(data.step.index, data.step)
        return next
      })
    })
    es.addEventListener("status", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        status: AgentTaskStatus
      }
      setStatus(data.status)
    })
    es.onerror = () => {
      es.close()
    }
    return () => es.close()
  }, [taskId, status])

  const steps = useMemo(
    () => Array.from(stepMap.values()).sort((a, b) => a.index - b.index),
    [stepMap],
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [steps.length])

  async function cancel() {
    try {
      const res = await fetch(`/api/admin/agents/tasks/${taskId}/cancel`, {
        method: "POST",
      })
      if (!res.ok) {
        toast.error(`Cancel failed (${res.status})`)
        return
      }
      toast.success("Cancel requested")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed")
    }
  }

  const running = status === "queued" || status === "running"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-heading-sm flex items-center gap-2">
                Task Execution
                <StatusPill status={status} />
              </CardTitle>
              <CardDescription className="text-caption">
                {steps.length} step{steps.length !== 1 ? "s" : ""} executed
                {running && " · streaming live"}
              </CardDescription>
            </div>
          </div>
          {running && (
            <Button variant="outline" size="sm" onClick={cancel} className="gap-2 text-destructive hover:text-destructive">
              <CircleStop className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
            <p className="text-body-sm text-muted-foreground">Waiting for first step…</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="relative space-y-0">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />

              {steps.map((s, i) => {
                const isLast = i === steps.length - 1
                const StepIcon = getStepIcon(s.kind)
                return (
                  <div key={s.index} className="relative flex gap-4 pb-4 last:pb-0">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        isLast && running
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      <StepIcon className="h-3.5 w-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-micro font-mono text-muted-foreground">
                          <Hash className="inline h-2.5 w-2.5" />
                          {String(s.index).padStart(3, "0")}
                        </span>
                        <Badge variant="outline" className="text-micro capitalize">
                          {s.kind}
                        </Badge>
                        {s.tool && (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-micro font-mono">
                            {s.tool}
                          </code>
                        )}
                        <span className="ml-auto text-micro tabular-nums text-muted-foreground">
                          {new Date(s.at).toLocaleTimeString()}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 border border-border/50 p-3 font-mono text-body-sm text-foreground/80">
                        {s.content}
                      </pre>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
        <div ref={endRef} />
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getStepIcon(kind: string) {
  switch (kind) {
    case "tool_call":
    case "tool":
      return Wrench
    case "message":
    case "assistant":
      return MessageSquare
    case "error":
      return XCircle
    default:
      return Terminal
  }
}

function StatusPill({ status }: { status: AgentTaskStatus }) {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    queued: {
      className: "border-border bg-muted text-muted-foreground",
      icon: <Clock className="h-3 w-3" />,
    },
    running: {
      className: "border-info/30 bg-info/10 text-info",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    succeeded: {
      className: "border-success/30 bg-success/10 text-success",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: <XCircle className="h-3 w-3" />,
    },
    cancelled: {
      className: "border-border bg-muted text-muted-foreground",
      icon: <CircleStop className="h-3 w-3" />,
    },
  }

  const c = config[status] ?? config.queued

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-micro capitalize", c.className)}>
      {c.icon}
      {status}
    </Badge>
  )
}
