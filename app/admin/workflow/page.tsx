import { WorkflowChat } from '@/components/admin/workflow/workflow-chat'
import { WorkflowScheduler } from '@/components/admin/workflow/workflow-scheduler'
import { WorkflowAnalytics } from '@/components/admin/workflow/workflow-analytics'

export default function WorkflowPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-xl">Workflow Orchestration</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Natural language workflow orchestration — describe complex operations and the AI handles execution.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WorkflowChat />
        </div>
        <div className="space-y-6">
          <WorkflowScheduler />
          <WorkflowAnalytics />
        </div>
      </div>
    </div>
  )
}
