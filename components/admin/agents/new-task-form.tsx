"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export function NewAgentTaskForm() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [maxSteps, setMaxSteps] = useState<number | "">("")
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) {
      toast.error("prompt is required")
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/agents/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            ...(typeof maxSteps === "number" ? { maxSteps } : {}),
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          toast.error(body?.error ?? `failed (${res.status})`)
          return
        }
        const data = (await res.json()) as { task: { id: string } }
        toast.success("task queued")
        router.push(`/admin/agents/${data.task.id}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="prompt">Prompt</Label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. Summarize the current server status and list any users close to their quota."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50"
          disabled={pending}
        />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="maxSteps">Max steps</Label>
          <input
            id="maxSteps"
            type="number"
            min={1}
            max={100}
            value={maxSteps}
            onChange={(e) =>
              setMaxSteps(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Queuing…" : "Run task"}
        </Button>
      </div>
    </form>
  )
}
