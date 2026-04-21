import Link from "next/link"
import type { AgentTask } from "@/lib/agents/types"

export function AgentTasksTable({ tasks }: { tasks: AgentTask[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Task</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Steps</th>
            <th className="py-2 pr-4 font-medium">Created</th>
            <th className="py-2 pr-4 font-medium">Model</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-4">
                <Link
                  href={`/admin/agents/${t.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {truncate(t.prompt, 80)}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={t.status} />
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{t.stepCount}</td>
              <td className="py-2 pr-4 text-muted-foreground">
                {new Date(t.createdAt).toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{t.model}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

function StatusBadge({ status }: { status: AgentTask["status"] }) {
  const cls = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    succeeded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "bg-red-500/15 text-red-700 dark:text-red-300",
    cancelled: "bg-muted text-muted-foreground",
  }[status]
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
