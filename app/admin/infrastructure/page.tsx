import { InfrastructureOverview } from "@/components/admin/infrastructure/overview"

export const dynamic = "force-dynamic"

export default function InfrastructurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Infrastructure Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage your red team infrastructure, nodes, and deployment configurations.
        </p>
      </div>

      <InfrastructureOverview />
    </div>
  )
}