import { WorkflowAnalyticsDashboard } from "@/components/admin/workflow/workflow-analytics-dashboard"

export const dynamic = "force-dynamic"

export default function WorkflowAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Workflow Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Monitor workflow execution statistics, success rates, and performance metrics.
        </p>
      </div>

      <WorkflowAnalyticsDashboard />
    </div>
  )
}