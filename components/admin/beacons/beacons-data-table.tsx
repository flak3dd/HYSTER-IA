import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArrowUpDown,
  MoreHorizontal,
  Terminal,
  ArrowRight,
  Key,
  Shield,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Beacon, BeaconsFilters, BeaconStatus, PrivilegeLevel } from "./beacons-view"
import { formatDistanceToNow } from "date-fns"

interface BeaconsDataTableProps {
  beacons: Beacon[]
  loading: boolean
  selectedBeacons: string[]
  onSelectionChange: (selected: string[]) => void
  onBeaconClick: (beacon: Beacon) => void
  onBulkAction: (action: string) => void
  filters: BeaconsFilters
}

export function BeaconsDataTable({
  beacons,
  loading,
  selectedBeacons,
  onSelectionChange,
  onBeaconClick,
  onBulkAction,
  filters
}: BeaconsDataTableProps) {
  const [sortColumn, setSortColumn] = useState<string>("lastCheckin")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  // Filter and sort beacons
  const filteredAndSortedBeacons = useMemo(() => {
    let filtered = [...beacons]

    // Apply status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter(b => filters.status.includes(b.status))
    }

    // Apply privilege level filter
    if (filters.privilegeLevel.length > 0) {
      filtered = filtered.filter(b => filters.privilegeLevel.includes(b.privileges))
    }

    // Apply OS family filter
    if (filters.osFamily.length > 0) {
      filtered = filtered.filter(b => filters.osFamily.includes(b.os))
    }

    // Apply domain filter
    if (filters.domain.length > 0) {
      filtered = filtered.filter(b => b.domain && filters.domain.includes(b.domain))
    }

    // Apply egress node filter
    if (filters.egressNode.length > 0) {
      filtered = filtered.filter(b => b.egressNode && filters.egressNode.includes(b.egressNode))
    }

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(b =>
        b.hostname.toLowerCase().includes(searchLower) ||
        b.ipAddress.toLowerCase().includes(searchLower) ||
        b.user.toLowerCase().includes(searchLower) ||
        (b.domain && b.domain.toLowerCase().includes(searchLower))
      )
    }

    // Apply last check-in filter
    if (filters.lastCheckin !== "all") {
      const now = Date.now()
      const thresholds: Record<string, number> = {
        "5m": 5 * 60 * 1000,
        "15m": 15 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000
      }
      filtered = filtered.filter(b => {
        const checkinTime = b.lastCheckin
        return now - checkinTime <= thresholds[filters.lastCheckin]
      })
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      const aValue = a[sortColumn as keyof Beacon]
      const bValue = b[sortColumn as keyof Beacon]

      if (aValue !== undefined && bValue !== undefined) {
        if (aValue < bValue) comparison = -1
        if (aValue > bValue) comparison = 1
      } else if (aValue !== undefined) {
        comparison = -1
      } else if (bValue !== undefined) {
        comparison = 1
      }

      return sortDirection === "asc" ? comparison : -comparison
    })

    return filtered
  }, [beacons, filters, sortColumn, sortDirection])

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(filteredAndSortedBeacons.map(b => b.id))
    } else {
      onSelectionChange([])
    }
  }

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedBeacons, id])
    } else {
      onSelectionChange(selectedBeacons.filter(s => s !== id))
    }
  }

  const getStatusColor = (status: BeaconStatus) => {
    switch (status) {
      case "online":
        return "bg-green-500"
      case "idle":
        return "bg-blue-500"
      case "stale":
        return "bg-orange-500"
      case "offline":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  const getPrivilegeColor = (privilege: PrivilegeLevel) => {
    switch (privilege) {
      case "system":
      case "root":
        return "bg-red-500"
      case "admin":
        return "bg-orange-500"
      case "user":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  const getRelativeTime = (date: Date | number) => {
    const now = Date.now()
    const timestamp = typeof date === 'number' ? date : date.getTime()
    const diff = now - timestamp
    const minutes = Math.floor(diff / (1000 * 60))

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading beacons...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Bulk Actions Bar */}
        {selectedBeacons.length > 0 && (
          <div className="flex items-center gap-2 p-4 border-b bg-muted/50">
            <span className="text-sm font-medium">
              {selectedBeacons.length} beacons selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" size="sm">
                  Bulk Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onBulkAction("run_command")}>
                  <Terminal className="mr-2 h-4 w-4" />
                  Run Command
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkAction("lateral_movement")}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Start Lateral Movement
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkAction("harvest_credentials")}>
                  <Key className="mr-2 h-4 w-4" />
                  Harvest Credentials
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onBulkAction("export")}>
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onBulkAction("kill")} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Kill Beacons
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-4 text-left">
                  <Checkbox
                    checked={selectedBeacons.length === filteredAndSortedBeacons.length && filteredAndSortedBeacons.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("hostname")}>
                  <div className="flex items-center gap-2">
                    Hostname
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ipAddress")}>
                  <div className="flex items-center gap-2">
                    IP Address
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("os")}>
                  <div className="flex items-center gap-2">
                    OS
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("domain")}>
                  <div className="flex items-center gap-2">
                    Domain
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("user")}>
                  <div className="flex items-center gap-2">
                    User
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("privileges")}>
                  <div className="flex items-center gap-2">
                    Privileges
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("lastCheckin")}>
                  <div className="flex items-center gap-2">
                    Last Check-in
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("status")}>
                  <div className="flex items-center gap-2">
                    Status
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("implantType")}>
                  <div className="flex items-center gap-2">
                    Implant Type
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left cursor-pointer hover:bg-muted/50" onClick={() => handleSort("egressNode")}>
                  <div className="flex items-center gap-2">
                    Egress Node
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </th>
                <th className="p-4 text-left">Tasks</th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedBeacons.map((beacon) => (
                <tr
                  key={beacon.id}
                  className="border-t hover:bg-muted/50 cursor-pointer"
                  onClick={() => onBeaconClick(beacon)}
                >
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedBeacons.includes(beacon.id)}
                      onCheckedChange={(checked) => handleSelectRow(beacon.id, checked as boolean)}
                    />
                  </td>
                  <td className="p-4 font-medium">{beacon.hostname}</td>
                  <td className="p-4">{beacon.ipAddress}</td>
                  <td className="p-4">
                    <Badge variant="outline">{beacon.os}</Badge>
                    {beacon.osVersion && (
                      <span className="text-xs text-muted-foreground ml-1">{beacon.osVersion}</span>
                    )}
                  </td>
                  <td className="p-4">{beacon.domain || "-"}</td>
                  <td className="p-4">{beacon.user}</td>
                  <td className="p-4">
                    <Badge className={cn(getPrivilegeColor(beacon.privileges), "text-white")}>
                      {beacon.privileges}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", getStatusColor(beacon.status))} />
                      {getRelativeTime(beacon.lastCheckin)}
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge className={cn(getStatusColor(beacon.status), "text-white")}>
                      {beacon.status}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge variant="secondary">{beacon.implantType}</Badge>
                  </td>
                  <td className="p-4">{beacon.egressNode || "-"}</td>
                  <td className="p-4">
                    {beacon.runningTasks > 0 ? (
                      <Badge variant="outline">{beacon.runningTasks} running</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => onBeaconClick(beacon)}>
                          <Terminal className="mr-2 h-4 w-4" />
                          Interact
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Pivot / Lateral Move
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Key className="mr-2 h-4 w-4" />
                          Harvest Credentials
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Shield className="mr-2 h-4 w-4" />
                          Privilege Escalation
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View in Nodes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(beacon.implantId)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Implant ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Kill Beacon
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSortedBeacons.length === 0 && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No beacons match the current filters
          </div>
        )}
      </CardContent>
    </Card>
  )
}