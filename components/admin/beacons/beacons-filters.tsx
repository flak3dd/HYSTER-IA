import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, X, Filter } from "lucide-react"
import { Beacon, BeaconsFilters } from "./beacons-view"
import { useState } from "react"

interface BeaconsFiltersProps {
  filters: BeaconsFilters
  onFiltersChange: (filters: BeaconsFilters) => void
  beacons: Beacon[]
}

export function BeaconsFilters({ filters, onFiltersChange, beacons }: BeaconsFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Get unique values for dropdowns
  const uniqueDomains = Array.from(new Set(beacons.map(b => b.domain).filter(Boolean)))
  const uniqueEgressNodes = Array.from(new Set(beacons.map(b => b.egressNode).filter(Boolean)))
  const uniqueOSFamilies = Array.from(new Set(beacons.map(b => b.os)))

  const toggleFilter = (type: keyof BeaconsFilters, value: string) => {
    const currentArray = filters[type] as string[]
    const newArray = currentArray.includes(value)
      ? currentArray.filter(v => v !== value)
      : [...currentArray, value]

    onFiltersChange({
      ...filters,
      [type]: newArray
    })
  }

  const clearFilters = () => {
    onFiltersChange({
      status: [],
      privilegeLevel: [],
      osFamily: [],
      domain: [],
      egressNode: [],
      lastCheckin: "all",
      search: ""
    })
  }

  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.privilegeLevel.length > 0 ||
    filters.osFamily.length > 0 ||
    filters.domain.length > 0 ||
    filters.egressNode.length > 0 ||
    filters.lastCheckin !== "all" ||
    filters.search !== ""

  return (
    <div className="space-y-4">
      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filters.privilegeLevel.includes("admin") ? "default" : "outline"}
          size="sm"
          onClick={() => toggleFilter("privilegeLevel", "admin")}
        >
          High Privilege Only
        </Button>
        <Button
          variant={filters.lastCheckin === "24h" ? "default" : "outline"}
          size="sm"
          onClick={() => onFiltersChange({ ...filters, lastCheckin: filters.lastCheckin === "24h" ? "all" : "24h" })}
        >
          Recently Compromised (24h)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Advanced Filters
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
          >
            <X className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/50">
          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <div className="flex flex-wrap gap-1">
              {["online", "idle", "stale", "offline"].map(status => (
                <Badge
                  key={status}
                  variant={filters.status.includes(status as any) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleFilter("status", status)}
                >
                  {status}
                </Badge>
              ))}
            </div>
          </div>

          {/* Privilege Level Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Privilege Level</label>
            <div className="flex flex-wrap gap-1">
              {["user", "admin", "system", "root"].map(level => (
                <Badge
                  key={level}
                  variant={filters.privilegeLevel.includes(level as any) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleFilter("privilegeLevel", level)}
                >
                  {level}
                </Badge>
              ))}
            </div>
          </div>

          {/* OS Family Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">OS Family</label>
            <div className="flex flex-wrap gap-1">
              {uniqueOSFamilies.map(os => (
                <Badge
                  key={os}
                  variant={filters.osFamily.includes(os) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleFilter("osFamily", os)}
                >
                  {os}
                </Badge>
              ))}
            </div>
          </div>

          {/* Last Check-in Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Last Check-in</label>
            <Select
              value={filters.lastCheckin}
              onValueChange={(value) => onFiltersChange({ ...filters, lastCheckin: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="5m">Last 5 minutes</SelectItem>
                <SelectItem value="15m">Last 15 minutes</SelectItem>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Domain Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Domain</label>
            <Select
              value={filters.domain[0] || "all"}
              onValueChange={(value) => onFiltersChange({
                ...filters,
                domain: value === "all" ? [] : [value]
              })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {uniqueDomains.map(domain => (
                  <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Egress Node Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Egress Node</label>
            <Select
              value={filters.egressNode[0] || "all"}
              onValueChange={(value) => onFiltersChange({
                ...filters,
                egressNode: value === "all" ? [] : [value]
              })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Nodes</SelectItem>
                {uniqueEgressNodes.map(node => (
                  <SelectItem key={node} value={node}>{node}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by hostname, IP, user, or domain..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-10"
        />
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.status.map(status => (
            <Badge key={status} variant="secondary" className="gap-1">
              Status: {status}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleFilter("status", status)} />
            </Badge>
          ))}
          {filters.privilegeLevel.map(level => (
            <Badge key={level} variant="secondary" className="gap-1">
              Privilege: {level}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleFilter("privilegeLevel", level)} />
            </Badge>
          ))}
          {filters.osFamily.map(os => (
            <Badge key={os} variant="secondary" className="gap-1">
              OS: {os}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleFilter("osFamily", os)} />
            </Badge>
          ))}
          {filters.domain.map(domain => (
            <Badge key={domain} variant="secondary" className="gap-1">
              Domain: {domain}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleFilter("domain", domain)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}