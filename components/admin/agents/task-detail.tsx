"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
        toast.error(`cancel failed (${res.status})`)
        return
      }
      toast.success("cancel requested")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "cancel failed")
    }
  }

  const running = status === "queued" || status === "running"

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">Status</span>
          <StatusPill status={status} />
          <span className="text-xs text-muted-foreground">{steps.length} steps</span>
        </CardTitle>
        {running ? (
          <Button variant="outline" size="sm" onClick={cancel}>
            Cancel
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Waiting for first step…</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {steps.map((s) => (
              <li
                key={s.index}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">
                    #{String(s.index).padStart(3, "0")} · {s.kind}
                    {s.tool ? ` · ${s.tool}` : ""}
                  </span>
                  <time>{new Date(s.at).toLocaleTimeString()}</time>
                </div>
                <pre className="whitespace-pre-wrap break-words text-sm">{s.content}</pre>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </CardContent>
    </Card>
  )
}

function StatusPill({ status }: { status: AgentTaskStatus }) {
  const cls =
    status === "running"
      ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
      : status === "succeeded"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : status === "failed"
          ? "bg-red-500/15 text-red-700 dark:text-red-300"
          : "bg-muted text-muted-foreground"
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  )
}
