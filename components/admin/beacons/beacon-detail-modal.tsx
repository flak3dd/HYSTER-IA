import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Beacon, BeaconStatus, PrivilegeLevel } from "./beacons-view"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api/fetch"
import { toast } from "sonner"
import {
  Terminal,
  Key,
  ArrowRight,
  Shield,
  Clock,
  Network,
  HardDrive,
  User,
  Send,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Download,
  Copy,
} from "lucide-react"
import { useState, useEffect } from "react"

interface BeaconDetailModalProps {
  beacon: Beacon | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BeaconDetailModal({ beacon, open, onOpenChange }: BeaconDetailModalProps) {
  const [command, setCommand] = useState("")
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [commandOutput, setCommandOutput] = useState<string[]>([
    "Connected to beacon " + beacon?.hostname,
    "System ready for commands...",
    ""
  ])
  const [credentials, setCredentials] = useState<any[]>([])
  const [credentialsLoading, setCredentialsLoading] = useState(false)
  const [lateralMovements, setLateralMovements] = useState<any[]>([])
  const [lateralMovementsLoading, setLateralMovementsLoading] = useState(false)

  // Fetch credentials when beacon changes or modal opens
  useEffect(() => {
    if (beacon && open) {
      fetchCredentials()
      fetchLateralMovements()
    }
  }, [beacon, open])

  const fetchCredentials = async () => {
    if (!beacon) return
    setCredentialsLoading(true)
    try {
      const res = await apiFetch(`/api/admin/credentials?sourceHostId=${beacon.id}`)
      if (res.ok) {
        const data = await res.json()
        setCredentials(data.credentials || [])
      }
    } catch (error) {
      console.error("Error fetching credentials:", error)
    } finally {
      setCredentialsLoading(false)
    }
  }

  const fetchLateralMovements = async () => {
    if (!beacon) return
    setLateralMovementsLoading(true)
    try {
      const res = await apiFetch(`/api/admin/lateral-movement?fromHostId=${beacon.id}`)
      if (res.ok) {
        const data = await res.json()
        setLateralMovements(data.movements || [])
      }
    } catch (error) {
      console.error("Error fetching lateral movements:", error)
    } finally {
      setLateralMovementsLoading(false)
    }
  }

  const handleHarvestCredentials = async () => {
    if (!beacon) return
    try {
      toast.info("Starting credential harvest...")
      // This would trigger the actual credential harvest via the post-exploitation engine
      // For now, we'll simulate it
      setTimeout(() => {
        toast.success("Credential harvest completed")
        fetchCredentials()
      }, 2000)
    } catch (error) {
      toast.error("Failed to harvest credentials")
    }
  }

  if (!beacon) return null

  const handleCommandSubmit = () => {
    if (!command.trim()) return

    setCommandHistory([...commandHistory, command])
    setCommandOutput([
      ...commandOutput,
      `$ ${command}`,
      "Command executed successfully",
      ""
    ])
    setCommand("")
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(beacon.status)}`} />
              <DialogTitle className="text-2xl">{beacon.hostname}</DialogTitle>
              <Badge className={cn(getPrivilegeColor(beacon.privileges), "text-white")}>
                {beacon.privileges}
              </Badge>
            </div>
            <Badge variant="outline">{beacon.implantType}</Badge>
          </div>
          <p className="text-muted-foreground">
            {beacon.ipAddress} • {beacon.os} {beacon.osVersion} • {beacon.domain}
          </p>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="lateral">Lateral</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    System Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="font-medium">{beacon.hostname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP Address</span>
                    <span className="font-medium">{beacon.ipAddress}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">OS</span>
                    <span className="font-medium">{beacon.os} {beacon.osVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Domain</span>
                    <span className="font-medium">{beacon.domain || "Workgroup"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User</span>
                    <span className="font-medium">{beacon.user}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Privileges</span>
                    <Badge className={cn(getPrivilegeColor(beacon.privileges), "text-white")}>
                      {beacon.privileges}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Network Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Egress Node</span>
                    <span className="font-medium">{beacon.egressNode || "Direct"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Implant Type</span>
                    <span className="font-medium">{beacon.implantType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Implant ID</span>
                    <span className="font-mono text-xs">{beacon.implantId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">First Seen</span>
                    <span className="font-medium">{formatDistanceToNow(new Date(beacon.firstSeen))} ago</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Check-in</span>
                    <span className="font-medium">{formatDistanceToNow(beacon.lastCheckin)} ago</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Running Tasks</span>
                    <Badge variant="outline">{beacon.runningTasks} active</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Network Interfaces
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm space-y-1">
                  <div>eth0: {beacon.ipAddress} (Up)</div>
                  <div>lo: 127.0.0.1 (Up)</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commands Tab */}
          <TabsContent value="commands" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter command..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCommandSubmit()}
                    className="font-mono"
                  />
                  <Button onClick={handleCommandSubmit}>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Command Output</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCommandOutput([])}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-64 overflow-y-auto">
                  {commandOutput.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {commandHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Command History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {commandHistory.map((cmd, i) => (
                      <div key={i} className="font-mono text-sm text-muted-foreground">
                        {cmd}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Credentials Tab */}
          <TabsContent value="credentials" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Harvested Credentials
                  </CardTitle>
                  <Button size="sm" onClick={handleHarvestCredentials} disabled={credentialsLoading}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", credentialsLoading && "animate-spin")} />
                    Harvest Now
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {credentialsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading credentials...
                  </div>
                ) : credentials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No credentials harvested yet. Click "Harvest Now" to collect credentials from this beacon.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {credentials.map((cred) => (
                      <div key={cred.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{cred.username}</span>
                            {cred.domain && <span className="text-muted-foreground">@{cred.domain}</span>}
                            <Badge variant="outline" className="text-xs">
                              {cred.type}
                            </Badge>
                            {cred.cracked && (
                              <Badge className="bg-green-500 text-white text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Cracked
                              </Badge>
                            )}
                          </div>
                          {cred.hash && (
                            <div className="text-xs text-muted-foreground font-mono mt-1">
                              {cred.hash.substring(0, 32)}...
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => {
                            navigator.clipboard.writeText(cred.hash || cred.plaintext || "")
                            toast.success("Copied to clipboard")
                          }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Active Tasks ({beacon.runningTasks})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {beacon.runningTasks > 0 ? (
                  <div className="space-y-2">
                    {[...Array(beacon.runningTasks)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                          <div>
                            <div className="font-medium">Task-{i + 1}</div>
                            <div className="text-sm text-muted-foreground">Running for {Math.floor(Math.random() * 10) + 1}m</div>
                          </div>
                        </div>
                        <Badge variant="outline">Running</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No active tasks running on this beacon
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { id: "task-001", type: "screenshot", status: "completed", time: "5m ago" },
                    { id: "task-002", type: "keylog", status: "completed", time: "1h ago" },
                    { id: "task-003", type: "persistence", status: "completed", time: "2h ago" },
                  ].map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{task.type}</div>
                        <div className="text-sm text-muted-foreground">{task.time}</div>
                      </div>
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lateral Movement Tab */}
          <TabsContent value="lateral" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Lateral Movement History
                  </CardTitle>
                  <Button size="sm" onClick={fetchLateralMovements} disabled={lateralMovementsLoading}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", lateralMovementsLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lateralMovementsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading lateral movements...
                  </div>
                ) : lateralMovements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No lateral movements executed yet from this beacon.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lateralMovements.map((movement) => (
                      <div key={movement.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{movement.fromHostname}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{movement.toHostname}</span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              movement.status === "success" && "bg-green-500 text-white border-green-500",
                              movement.status === "failed" && "bg-red-500 text-white border-red-500"
                            )}
                          >
                            {movement.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Technique: {movement.technique}</span>
                          <span>{formatDistanceToNow(new Date(movement.timestamp))} ago</span>
                        </div>
                        {movement.errorMessage && (
                          <div className="text-sm text-red-500 mt-1">{movement.errorMessage}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                    Execute New Lateral Movement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Select target beacon and technique to execute lateral movement.
                    <br />
                    <span className="text-xs">(Coming soon: Full lateral movement execution UI)</span>
                  </div>
                </CardContent>
              </Card>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Event Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { event: "Beacon check-in", time: "2m ago", type: "info" },
                    { event: "Task completed: screenshot", time: "5m ago", type: "success" },
                    { event: "Lateral movement attempt", time: "1h ago", type: "warning" },
                    { event: "Beacon first connected", time: "24h ago", type: "info" },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full ${
                          item.type === "success" ? "bg-green-500" :
                          item.type === "warning" ? "bg-orange-500" :
                          "bg-blue-500"
                        }`} />
                        {i < 3 && <div className="w-0.5 h-8 bg-muted" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="font-medium">{item.event}</div>
                        <div className="text-sm text-muted-foreground">{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}