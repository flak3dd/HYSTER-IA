import { TrafficDashboard } from "@/components/admin/infrastructure/traffic-dashboard"

export const dynamic = "force-dynamic"

export default function TrafficPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-xl">Traffic Management</h1>
        <p className="text-sm text-muted-foreground">
          Monitor and manage traffic routing, failover, and geographic distribution.
        </p>
      </div>

      <TrafficDashboard />
    </div>
  )
}