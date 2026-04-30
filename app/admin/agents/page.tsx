import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { NewAgentTaskForm } from "@/components/admin/agents/new-task-form"
import { AgentTasksTable } from "@/components/admin/agents/tasks-table"
import { listTaskRows } from "@/lib/agents/db"
import { Bot, Zap, Info } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function AgentsPage() {
  const tasks = await listTaskRows(50).catch(() => [])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-xl">Agents</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Run LLM-driven tasks with panel read-only tools and proxy-aware web
            fetches. Outbound traffic egresses through the configured Hysteria 2 node.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 text-micro">
          <Bot className="h-3 w-3" />
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-heading-sm">New Task</CardTitle>
              <CardDescription className="text-caption">
                Describe an objective for the LLM agent to execute
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <NewAgentTaskForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-heading-sm">Recent Tasks</CardTitle>
              <CardDescription className="text-caption">
                {tasks.length === 0
                  ? "No tasks have been run yet"
                  : `Showing last ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Bot className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-body-sm font-medium">No tasks yet</p>
                <p className="text-caption text-muted-foreground">
                  Create your first task above to get started
                </p>
              </div>
            </div>
          ) : (
            <AgentTasksTable tasks={tasks} />
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        <p className="text-micro text-muted-foreground">
          Set <code className="rounded bg-muted px-1 py-0.5 text-foreground/70">LLM_PROVIDER_API_KEY</code> and
          optionally <code className="rounded bg-muted px-1 py-0.5 text-foreground/70">HYSTERIA_EGRESS_PROXY_URL</code>{" "}
          in your environment before running a task.
        </p>
      </div>
    </div>
  )
}
