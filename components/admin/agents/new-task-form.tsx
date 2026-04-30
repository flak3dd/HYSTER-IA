"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Loader2, Play } from "lucide-react"

export function NewAgentTaskForm() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [maxSteps, setMaxSteps] = useState<number | "">("")
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) {
      toast.error("Prompt is required")
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
          toast.error(body?.error ?? `Failed (${res.status})`)
          return
        }
        const data = (await res.json()) as { task: { id: string } }
        toast.success("Task queued successfully")
        router.push(`/admin/agents/${data.task.id}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="prompt" className="text-caption font-medium">
          Prompt
        </Label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. Summarize the current server status and list any users close to their quota."
          disabled={pending}
          className="resize-none"
        />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="maxSteps" className="text-caption font-medium">
            Max steps
          </Label>
          <Input
            id="maxSteps"
            type="number"
            min={1}
            max={100}
            value={maxSteps}
            onChange={(e) =>
              setMaxSteps(e.target.value === "" ? "" : Number(e.target.value))
            }
            disabled={pending}
            placeholder="10"
          />
        </div>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Queuing…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Task
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
