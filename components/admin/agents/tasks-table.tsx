import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AgentTask } from "@/lib/agents/types"

export function AgentTasksTable({ tasks }: { tasks: AgentTask[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-caption">Task</TableHead>
          <TableHead className="text-caption w-[100px]">Status</TableHead>
          <TableHead className="text-caption w-[70px]">Steps</TableHead>
          <TableHead className="text-caption w-[140px]">Created</TableHead>
          <TableHead className="text-caption w-[120px]">Model</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <TableRow key={t.id} className="group">
            <TableCell>
              <Link
                href={`/admin/agents/${t.id}`}
                className="flex items-center gap-1.5 text-body-sm hover:text-primary transition-colors"
              >
                <span className="truncate max-w-[400px]">{truncate(t.prompt, 80)}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </TableCell>
            <TableCell>
              <StatusBadge status={t.status} />
            </TableCell>
            <TableCell className="text-body-sm tabular-nums text-muted-foreground">
              {t.stepCount}
            </TableCell>
            <TableCell className="text-caption tabular-nums text-muted-foreground">
              {new Date(t.createdAt).toLocaleString()}
            </TableCell>
            <TableCell>
              <code className="text-micro font-mono text-muted-foreground">{t.model}</code>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

function StatusBadge({ status }: { status: AgentTask["status"] }) {
  const config: Record<string, { className: string; dot: string }> = {
    queued: {
      className: "border-border bg-muted text-muted-foreground",
      dot: "bg-muted-foreground",
    },
    running: {
      className: "border-info/30 bg-info/10 text-info",
      dot: "bg-info animate-pulse",
    },
    succeeded: {
      className: "border-success/30 bg-success/10 text-success",
      dot: "bg-success",
    },
    failed: {
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      dot: "bg-destructive",
    },
    cancelled: {
      className: "border-border bg-muted text-muted-foreground",
      dot: "bg-muted-foreground",
    },
  }

  const c = config[status] ?? config.queued

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-micro capitalize", c.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {status}
    </Badge>
  )
}
