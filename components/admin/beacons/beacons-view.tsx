"use client"

import { useState, useEffect, useCallback } from "react"
import { BeaconsSummaryCards } from "./beacons-summary-cards"
import { BeaconsDataTable } from "./beacons-data-table"
import { BeaconsFilters } from "./beacons-filters"
import { BeaconDetailModal } from "./beacon-detail-modal"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

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
  lastCheckin: Date
  status: BeaconStatus
  implantType: string
  egressNode?: string
  runningTasks: number
  firstSeen: Date
  nodeId?: string
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
      // This would be replaced with actual API call
      // For now, simulate data
      const mockBeacons: Beacon[] = [
        {
          id: "1",
          implantId: "implant-001",
          hostname: "DESKTOP-ABC123",
          ipAddress: "10.0.0.45",
          os: "Windows",
          osVersion: "11 Pro",
          domain: "corp.local",
          user: "jsmith",
          privileges: "admin",
          lastCheckin: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
          status: "online",
          implantType: "Hysteria2",
          egressNode: "node-sg-01",
          runningTasks: 3,
          firstSeen: new Date(Date.now() - 24 * 60 * 60 * 1000),
          nodeId: "node-1"
        },
        {
          id: "2",
          implantId: "implant-002",
          hostname: "WORKSTATION-XYZ",
          ipAddress: "10.0.0.67",
          os: "Windows",
          osVersion: "10 Pro",
          domain: "corp.local",
          user: "bjohnson",
          privileges: "user",
          lastCheckin: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          status: "idle",
          implantType: "Hysteria2",
          egressNode: "node-sg-01",
          runningTasks: 0,
          firstSeen: new Date(Date.now() - 48 * 60 * 60 * 1000),
          nodeId: "node-1"
        },
        {
          id: "3",
          implantId: "implant-003",
          hostname: "SRV-001",
          ipAddress: "10.0.0.100",
          os: "Windows",
          osVersion: "Server 2022",
          domain: "corp.local",
          user: "SYSTEM",
          privileges: "system",
          lastCheckin: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
          status: "online",
          implantType: "Swarm",
          egressNode: "node-us-east-1",
          runningTasks: 5,
          firstSeen: new Date(Date.now() - 72 * 60 * 60 * 1000),
          nodeId: "node-2"
        },
        {
          id: "4",
          implantId: "implant-004",
          hostname: "linux-box-01",
          ipAddress: "10.0.0.200",
          os: "Linux",
          osVersion: "Ubuntu 22.04",
          domain: "corp.local",
          user: "root",
          privileges: "root",
          lastCheckin: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
          status: "stale",
          implantType: "Hysteria2",
          egressNode: "node-eu-west-1",
          runningTasks: 1,
          firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          nodeId: "node-3"
        }
      ]

      setBeacons(mockBeacons)
      updateStats(mockBeacons)
    } catch (error) {
      toast.error("Failed to fetch beacons")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Update statistics
  const updateStats = useCallback((data: Beacon[]) => {
    const uniqueDomains = new Set(data.map(b => b.domain).filter(Boolean))
    const highPrivilegeCount = data.filter(
      b => b.privileges === "admin" || b.privileges === "system" || b.privileges === "root"
    ).length
    const staleCount = data.filter(b => b.status === "stale" || b.status === "offline").length

    setStats({
      total: data.length,
      active: data.filter(b => b.status === "online" || b.status === "idle").length,
      highPrivilege: highPrivilegeCount,
      domains: uniqueDomains.size,
      stale: staleCount
    })
  }, [])

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