"use client"

import { useState, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Play,
  Square,
  RotateCcw,
  Eye,
  Plus,
  Network,
  Globe,
  Wifi,
  Shield,
  Server,
  Clock,
  Monitor,
  Activity,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ScanStatus = "Completed" | "Running" | "Scheduled" | "Active" | "Stopped"

interface ScanEntry {
  id: string
  name: string
  status: ScanStatus
  type: string
  target: string
  duration: string
  hosts: string
  ports: string
  startedAt: string
  findings: Finding[]
}

interface Finding {
  host: string
  port: string
  service: string
  version: string
  risk: "low" | "medium" | "high" | "info"
}

/* ------------------------------------------------------------------ */
/*  Initial mock data                                                  */
/* ------------------------------------------------------------------ */

const INITIAL_SCANS: ScanEntry[] = [
  {
    id: "scan-1",
    name: "Internal Network Scan",
    status: "Completed",
    type: "Full TCP",
    target: "10.0.0.0/16",
    duration: "45 min",
    hosts: "1,247",
    ports: "8,934",
    startedAt: "2026-04-29 14:30 UTC",
    findings: [
      { host: "10.0.1.15", port: "22", service: "SSH", version: "OpenSSH 8.9", risk: "low" },
      { host: "10.0.1.15", port: "80", service: "HTTP", version: "nginx 1.24", risk: "info" },
      { host: "10.0.2.40", port: "3389", service: "RDP", version: "Microsoft Terminal", risk: "high" },
      { host: "10.0.3.12", port: "445", service: "SMB", version: "Samba 4.17", risk: "medium" },
      { host: "10.0.5.100", port: "8443", service: "HTTPS", version: "Apache 2.4", risk: "info" },
    ],
  },
  {
    id: "scan-2",
    name: "Subnet Enumeration",
    status: "Running",
    type: "SYN Stealth",
    target: "192.168.1.0/24",
    duration: "12 min",
    hosts: "567",
    ports: "2,145",
    startedAt: "2026-04-30 06:18 UTC",
    findings: [
      { host: "192.168.1.1", port: "53", service: "DNS", version: "dnsmasq 2.89", risk: "low" },
      { host: "192.168.1.50", port: "443", service: "HTTPS", version: "IIS 10.0", risk: "medium" },
    ],
  },
  {
    id: "scan-3",
    name: "Cloud Network Discovery",
    status: "Scheduled",
    type: "Cloud API",
    target: "AWS us-east-1",
    duration: "—",
    hosts: "—",
    ports: "—",
    startedAt: "Scheduled: 2026-04-30 12:00 UTC",
    findings: [],
  },
  {
    id: "scan-4",
    name: "Wireless Network Mapping",
    status: "Completed",
    type: "Passive WiFi",
    target: "802.11 a/b/g/n/ac",
    duration: "30 min",
    hosts: "89",
    ports: "567",
    startedAt: "2026-04-28 22:15 UTC",
    findings: [
      { host: "BSSID:AA:BB:CC:DD:EE:01", port: "—", service: "WPA2-PSK", version: "Channel 6", risk: "info" },
      { host: "BSSID:AA:BB:CC:DD:EE:02", port: "—", service: "WPA3-SAE", version: "Channel 36", risk: "low" },
      { host: "BSSID:FF:00:11:22:33:44", port: "—", service: "Open", version: "Channel 1", risk: "high" },
    ],
  },
  {
    id: "scan-5",
    name: "VPN Detection",
    status: "Active",
    type: "Traffic Analysis",
    target: "0.0.0.0/0",
    duration: "Continuous",
    hosts: "234",
    ports: "1,024",
    startedAt: "2026-04-27 00:00 UTC",
    findings: [
      { host: "45.33.32.156", port: "1194", service: "OpenVPN", version: "2.5.x", risk: "info" },
      { host: "104.16.0.0/12", port: "443", service: "Cloudflare WARP", version: "—", risk: "low" },
    ],
  },
]

const SCAN_TYPES = [
  "Full TCP",
  "SYN Stealth",
  "UDP Scan",
  "Cloud API",
  "Passive WiFi",
  "Traffic Analysis",
  "Service Detection",
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusVariant(status: ScanStatus) {
  switch (status) {
    case "Completed":
      return "default" as const
    case "Running":
    case "Active":
      return "default" as const
    case "Scheduled":
      return "secondary" as const
    case "Stopped":
      return "secondary" as const
  }
}

function statusDot(status: ScanStatus) {
  switch (status) {
    case "Completed":
      return "bg-success"
    case "Running":
    case "Active":
      return "bg-info animate-pulse"
    case "Scheduled":
      return "bg-warning"
    case "Stopped":
      return "bg-muted-foreground"
  }
}

function riskColor(risk: Finding["risk"]) {
  switch (risk) {
    case "high":
      return "text-destructive"
    case "medium":
      return "text-warning"
    case "low":
      return "text-success"
    case "info":
      return "text-info"
  }
}

function riskBadgeVariant(risk: Finding["risk"]) {
  switch (risk) {
    case "high":
      return "destructive" as const
    case "medium":
    case "low":
    case "info":
      return "secondary" as const
  }
}

function scanIcon(type: string) {
  switch (type) {
    case "Full TCP":
    case "SYN Stealth":
    case "UDP Scan":
      return Network
    case "Cloud API":
      return Globe
    case "Passive WiFi":
      return Wifi
    case "Traffic Analysis":
      return Activity
    case "Service Detection":
      return Server
    default:
      return Network
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NetworkMapView() {
  const [scans, setScans] = useState<ScanEntry[]>(INITIAL_SCANS)
  const [selectedScan, setSelectedScan] = useState<ScanEntry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [newScanOpen, setNewScanOpen] = useState(false)

  // Form state for new scan
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState("")
  const [newTarget, setNewTarget] = useState("")

  const handleViewDetails = useCallback((scan: ScanEntry) => {
    setSelectedScan(scan)
    setDetailOpen(true)
  }, [])

  const handleStopScan = useCallback((scanId: string) => {
    setScans((prev) =>
      prev.map((s) =>
        s.id === scanId && (s.status === "Running" || s.status === "Active")
          ? { ...s, status: "Stopped" as ScanStatus }
          : s
      )
    )
  }, [])

  const handleRerunScan = useCallback((scanId: string) => {
    setScans((prev) =>
      prev.map((s) =>
        s.id === scanId && (s.status === "Completed" || s.status === "Stopped")
          ? { ...s, status: "Running" as ScanStatus, duration: "0 min", startedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC" }
          : s
      )
    )
  }, [])

  const handleStartScan = useCallback(() => {
    if (!newName.trim() || !newType || !newTarget.trim()) return

    const scan: ScanEntry = {
      id: `scan-${Date.now()}`,
      name: newName.trim(),
      status: "Running",
      type: newType,
      target: newTarget.trim(),
      duration: "0 min",
      hosts: "0",
      ports: "0",
      startedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
      findings: [],
    }

    setScans((prev) => [scan, ...prev])
    setNewName("")
    setNewType("")
    setNewTarget("")
    setNewScanOpen(false)
  }, [newName, newType, newTarget])

  const handleRunScheduled = useCallback((scanId: string) => {
    setScans((prev) =>
      prev.map((s) =>
        s.id === scanId && s.status === "Scheduled"
          ? { ...s, status: "Running" as ScanStatus, startedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC" }
          : s
      )
    )
  }, [])

  // Stats
  const totalScans = scans.length
  const runningScans = scans.filter((s) => s.status === "Running" || s.status === "Active").length
  const completedScans = scans.filter((s) => s.status === "Completed").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-xl">Passive Network Mapping</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Passive network reconnaissance and topology mapping capabilities.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Network className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-heading-lg">{totalScans}</p>
              <p className="text-caption text-muted-foreground">Total Scans</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
              <Activity className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-heading-lg">{runningScans}</p>
              <p className="text-caption text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <Shield className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-heading-lg">{completedScans}</p>
              <p className="text-caption text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scans list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Network Scans</CardTitle>
              <CardDescription>Manage passive network discovery operations</CardDescription>
            </div>
            <Dialog open={newScanOpen} onOpenChange={setNewScanOpen}>
              <DialogTrigger
                render={<Button />}
              >
                <Plus className="mr-2 h-4 w-4" />
                Start New Scan
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Start New Scan</DialogTitle>
                  <DialogDescription>
                    Configure and launch a new passive network discovery scan.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="scan-name">Scan Name</Label>
                    <Input
                      id="scan-name"
                      placeholder="e.g. DMZ Perimeter Scan"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scan Type</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v ?? "")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select scan type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SCAN_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scan-target">Target Range</Label>
                    <Input
                      id="scan-target"
                      placeholder="e.g. 10.0.0.0/8 or AWS us-east-1"
                      value={newTarget}
                      onChange={(e) => setNewTarget(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={handleStartScan}
                    disabled={!newName.trim() || !newType || !newTarget.trim()}
                  >
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Launch Scan
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scans.map((scan) => {
              const ScanIcon = scanIcon(scan.type)
              return (
                <div
                  key={scan.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <ScanIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-heading-sm">{scan.name}</h3>
                      <p className="text-caption text-muted-foreground">
                        {scan.type} · Target: {scan.target} · Duration: {scan.duration} · Hosts: {scan.hosts} · Ports: {scan.ports}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(scan.status)} className="gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(scan.status)}`} />
                      {scan.status}
                    </Badge>

                    {/* Action buttons based on status */}
                    {(scan.status === "Running" || scan.status === "Active") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStopScan(scan.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Square className="mr-1.5 h-3 w-3" />
                        Stop
                      </Button>
                    )}

                    {scan.status === "Scheduled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRunScheduled(scan.id)}
                      >
                        <Play className="mr-1.5 h-3 w-3" />
                        Run Now
                      </Button>
                    )}

                    {(scan.status === "Completed" || scan.status === "Stopped") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRerunScan(scan.id)}
                      >
                        <RotateCcw className="mr-1.5 h-3 w-3" />
                        Re-run
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewDetails(scan)}
                    >
                      <Eye className="mr-1.5 h-3 w-3" />
                      Details
                    </Button>
                  </div>
                </div>
              )
            })}

            {scans.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <Network className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-body-sm text-muted-foreground">No scans yet</p>
                <p className="text-caption text-muted-foreground/70">
                  Start a new scan to begin mapping your network.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          {selectedScan && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedScan.name}</SheetTitle>
                <SheetDescription>
                  {selectedScan.type} scan targeting {selectedScan.target}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <MetaItem icon={Clock} label="Started" value={selectedScan.startedAt} />
                  <MetaItem icon={Activity} label="Duration" value={selectedScan.duration} />
                  <MetaItem icon={Monitor} label="Hosts Found" value={selectedScan.hosts} />
                  <MetaItem icon={Server} label="Ports Found" value={selectedScan.ports} />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-label text-muted-foreground">Status</span>
                  <Badge variant={statusVariant(selectedScan.status)} className="gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot(selectedScan.status)}`} />
                    {selectedScan.status}
                  </Badge>
                </div>

                <Separator />

                {/* Findings */}
                <div>
                  <h3 className="text-heading-sm mb-3">
                    Findings ({selectedScan.findings.length})
                  </h3>
                  {selectedScan.findings.length > 0 ? (
                    <div className="space-y-2">
                      {selectedScan.findings.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div>
                            <p className="text-body-sm font-medium font-mono">
                              {f.host}{f.port !== "—" ? `:${f.port}` : ""}
                            </p>
                            <p className="text-caption text-muted-foreground">
                              {f.service} {f.version && `· ${f.version}`}
                            </p>
                          </div>
                          <Badge variant={riskBadgeVariant(f.risk)} className={riskColor(f.risk)}>
                            {f.risk.toUpperCase()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-body-sm text-muted-foreground">
                      {selectedScan.status === "Scheduled"
                        ? "Scan has not started yet — no findings available."
                        : "No findings recorded for this scan."}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  {(selectedScan.status === "Running" || selectedScan.status === "Active") && (
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        handleStopScan(selectedScan.id)
                        setSelectedScan((prev) => prev ? { ...prev, status: "Stopped" } : null)
                      }}
                    >
                      <Square className="mr-2 h-3.5 w-3.5" />
                      Stop Scan
                    </Button>
                  )}
                  {(selectedScan.status === "Completed" || selectedScan.status === "Stopped") && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleRerunScan(selectedScan.id)
                        setSelectedScan((prev) => prev ? { ...prev, status: "Running" } : null)
                      }}
                    >
                      <RotateCcw className="mr-2 h-3.5 w-3.5" />
                      Re-run Scan
                    </Button>
                  )}
                  {selectedScan.status === "Scheduled" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleRunScheduled(selectedScan.id)
                        setSelectedScan((prev) => prev ? { ...prev, status: "Running" } : null)
                      }}
                    >
                      <Play className="mr-2 h-3.5 w-3.5" />
                      Run Now
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-body-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
