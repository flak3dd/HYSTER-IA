import { Card, CardContent } from "@/components/ui/card"
import { Activity, Shield, Globe, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface BeaconsSummaryCardsProps {
  stats: {
    total: number
    active: number
    highPrivilege: number
    domains: number
    stale: number
  }
  onFilterClick?: (filter: { type: string; value: any }) => void
}

interface SummaryCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  color: string
  onClick?: () => void
}

function SummaryCard({ title, value, subtitle, icon, color, onClick }: SummaryCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-lg",
        onClick && "hover:scale-105"
      )}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={cn("p-3 rounded-full", color)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BeaconsSummaryCards({ stats, onFilterClick }: BeaconsSummaryCardsProps) {
  const activePercentage = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0
  const isActiveHealthy = activePercentage >= 80

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard
        title="Active Beacons"
        value={`${stats.active} / ${stats.total}`}
        subtitle={`${activePercentage}% online`}
        icon={<Activity className="h-6 w-6 text-white" />}
        color={isActiveHealthy ? "bg-green-500" : "bg-yellow-500"}
        onClick={() => onFilterClick?.({ type: "status", value: ["online", "idle"] })}
      />

      <SummaryCard
        title="High Privilege"
        value={stats.highPrivilege.toString()}
        subtitle="Admin / System / Root"
        icon={<Shield className="h-6 w-6 text-white" />}
        color="bg-orange-500"
        onClick={() => onFilterClick?.({ type: "privilegeLevel", value: ["admin", "system", "root"] })}
      />

      <SummaryCard
        title="Domains Compromised"
        value={stats.domains.toString()}
        subtitle="Unique domains"
        icon={<Globe className="h-6 w-6 text-white" />}
        color="bg-blue-500"
        onClick={() => onFilterClick?.({ type: "domains", value: true })}
      />

      <SummaryCard
        title="Stale / Offline"
        value={stats.stale.toString()}
        subtitle="No check-in > 15 min"
        icon={<AlertTriangle className="h-6 w-6 text-white" />}
        color="bg-yellow-500"
        onClick={() => onFilterClick?.({ type: "status", value: ["stale", "offline"] })}
      />
    </div>
  )
}