import { WorkflowChat } from '@/components/admin/workflow/workflow-chat'

export default function WorkflowPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-xl">Workflow Orchestration</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Natural language workflow orchestration — describe complex operations and the AI handles execution.
        </p>
      </div>
      <WorkflowChat />
    </div>
  )
}
