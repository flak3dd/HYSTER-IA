import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getTaskRow, listStepRows } from "@/lib/agents/db"
import { TaskDetail } from "@/components/admin/agents/task-detail"

export const dynamic = "force-dynamic"

export default async function AgentTaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const task = await getTaskRow(id)
  if (!task) return notFound()
  const initialSteps = await listStepRows(id)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Task detail</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/agents" className="underline-offset-2 hover:underline">
              ← Back to tasks
            </Link>
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{task.prompt}</p>
        </CardContent>
      </Card>

      <TaskDetail taskId={id} initialTask={task} initialSteps={initialSteps} />
    </div>
  )
}
