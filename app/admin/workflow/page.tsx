import { WorkflowChat } from '@/components/admin/workflow/workflow-chat'
import { Workflow, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function WorkflowPage() {
  return (
    <div className="flex flex-col gap-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.06] via-card to-card px-5 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 ring-1 ring-primary/30">
              <Workflow className="h-5 w-5 text-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-success ring-2 ring-card glow-success">
                <Sparkles className="h-2 w-2 text-success-foreground" />
              </span>
            </div>
            <div>
              <h1 className="text-heading-lg leading-tight">Workflow Orchestration</h1>
              <p className="text-caption text-muted-foreground">
                Describe complex operations in natural language — the AI plans, asks, and
                executes step by step.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-success/30 bg-success/10 px-2.5 py-1 text-micro text-success"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Engine Online
            </Badge>
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/30 bg-primary/10 px-2.5 py-1 text-micro text-primary"
            >
              <Sparkles className="h-3 w-3" />
              Multi-step
            </Badge>
          </div>
        </div>
      </div>

      <WorkflowChat />
    </div>
  )
}
