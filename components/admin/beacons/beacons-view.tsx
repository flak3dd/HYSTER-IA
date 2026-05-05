"use client"

import { useState, useEffect, useCallback } from "react"
import { BeaconsSummaryCards } from "./beacons-summary-cards"
import { BeaconsDataTable } from "./beacons-data-table"
import { BeaconsFilters } from "./beacons-filters"
import { BeaconDetailModal } from "./beacon-detail-modal"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api/fetch"

// Types
export type BeaconStatus = "online" | "idle" | "stale" | "offline"
export type PrivilegeLevel = "user" | "admin" | "system" | "root"

export interface Beacon {
  id: string
  implantId: string
  hostname: string
  ipAddress: string
  os: string
  osVersion?: string
  domain?: string
  user: string
  privileges: PrivilegeLevel
  lastCheckin: number
  status: BeaconStatus
  implantType: string
  egressNode?: string
  runningTasks: number
  firstSeen: number
  nodeId?: string
  createdAt: number
  updatedAt: number
}

export interface BeaconsFilters {
  status: BeaconStatus[]
  privilegeLevel: PrivilegeLevel[]
  osFamily: string[]
  domain: string[]
  egressNode: string[]
  lastCheckin: string
  search: string
}

export default function BeaconsView() {
  const [beacons, setBeacons] = useState<Beacon[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBeacons, setSelectedBeacons] = useState<string[]>([])
  const [selectedBeacon, setSelectedBeacon] = useState<Beacon | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [filters, setFilters] = useState<BeaconsFilters>({
    status: [],
    privilegeLevel: [],
    osFamily: [],
    domain: [],
    egressNode: [],
    lastCheckin: "all",
    search: ""
  })
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    highPrivilege: 0,
    domains: 0,
    stale: 0
  })

  // Fetch beacons data
  const fetchBeacons = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      
      if (filters.status.length > 0) {
        filters.status.forEach(s => params.append("status", s))
      }
      if (filters.privilegeLevel.length > 0) {
        filters.privilegeLevel.forEach(p => params.append("privilegeLevel", p))
      }
      if (filters.osFamily.length > 0) {
        filters.osFamily.forEach(o => params.append("osFamily", o))
      }
      if (filters.domain.length > 0) {
        filters.domain.forEach(d => params.append("domain", d))
      }
      if (filters.search) {
        params.append("search", filters.search)
      }
      
      const res = await apiFetch(`/api/admin/beacons?${params.toString()}`)
      
      if (res.ok) {
        const data = await res.json()
        setBeacons(data.beacons || [])
        const apiStats = data.stats || {
          total: 0,
          online: 0,
          idle: 0,
          stale: 0,
          offline: 0,
          highPrivilege: 0,
          domains: 0,
        }
        setStats({
          total: apiStats.total,
          active: apiStats.online + apiStats.idle,
          highPrivilege: apiStats.highPrivilege,
          domains: apiStats.domains,
          stale: apiStats.stale
        })
      } else {
        toast.error("Failed to fetch beacons")
      }
    } catch (error) {
      console.error("Error fetching beacons:", error)
      toast.error("Failed to fetch beacons")
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchBeacons()
    const interval = setInterval(fetchBeacons, 5000)
    return () => clearInterval(interval)
  }, [fetchBeacons])

  // Handle beacon selection
  const handleBeaconClick = (beacon: Beacon) => {
    setSelectedBeacon(beacon)
    setDetailModalOpen(true)
  }

  // Handle bulk actions
  const handleBulkAction = async (action: string) => {
    toast.success(`Bulk action "${action}" executed on ${selectedBeacons.length} beacons`)
    setSelectedBeacons([])
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Beacons</h1>
          <p className="text-muted-foreground">
            Real-time view of active implants and sessions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchBeacons}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Implant
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <BeaconsSummaryCards stats={stats} onFilterClick={(filter) => {
        // Handle quick filter from cards
        setFilters(prev => ({ ...prev, [filter.type]: filter.value }))
      }} />

      {/* Filters */}
      <BeaconsFilters
        filters={filters}
        onFiltersChange={setFilters}
        beacons={beacons}
      />

      {/* Data Table */}
      <BeaconsDataTable
        beacons={beacons}
        loading={loading}
        selectedBeacons={selectedBeacons}
        onSelectionChange={setSelectedBeacons}
        onBeaconClick={handleBeaconClick}
        onBulkAction={handleBulkAction}
        filters={filters}
      />

      {/* Beacon Detail Modal */}
      <BeaconDetailModal
        beacon={selectedBeacon}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </div>
  )
}