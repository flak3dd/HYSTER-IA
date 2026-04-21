import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NewAgentTaskForm } from "@/components/admin/agents/new-task-form"
import { AgentTasksTable } from "@/components/admin/agents/tasks-table"
import { listTaskRows } from "@/lib/agents/db"

export const dynamic = "force-dynamic"

export default async function AgentsPage() {
  const tasks = await listTaskRows(50).catch(() => [])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Run an LLM-driven task that uses panel read-only tools and proxy-aware web
            fetches. Outbound traffic egresses through the configured Hysteria 2 node.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New task</CardTitle>
        </CardHeader>
        <CardContent>
          <NewAgentTaskForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <AgentTasksTable tasks={tasks} />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Set <code>LLM_PROVIDER_API_KEY</code> and (optionally){" "}
        <code>HYSTERIA_EGRESS_PROXY_URL</code> in your environment before running a task.{" "}
        <Link href="/admin" className="underline">
          Back to overview
        </Link>
      </p>
    </div>
  )
}
