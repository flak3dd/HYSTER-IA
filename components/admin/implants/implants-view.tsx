"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useState, useCallback, useEffect } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  RefreshCw,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ImplantStatus = "active" | "inactive" | "compromised" | "exited"
type TaskStatus = "pending" | "running" | "completed" | "failed"

interface Implant {
  id: string
  implantId: string
  name: string
  type: string
  architecture: string
  targetId?: string
  status: ImplantStatus
  lastSeen?: number | null
  firstSeen: number
  config: Record<string, unknown>
  transportConfig: Record<string, unknown>
  nodeId?: string
  createdAt: number
  updatedAt: number
}

interface ImplantTask {
  id: string
  implantId: string
  taskId: string
  type: string
  args: Record<string, unknown>
  status: TaskStatus
  result?: Record<string, unknown> | null
  error?: string
  createdById?: string
  createdAt: number
  completedAt?: number | null
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ImplantsView() {
  const [implants, setImplants] = useState<Implant[]>([])
  const [selectedImplant, setSelectedImplant] = useState<Implant | null>(null)
  const [implantTasks, setImplantTasks] = useState<ImplantTask[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [form, setForm] = useState({
    name: "",
    type: "windows-exe",
    architecture: "amd64",
    targetId: "",
  })
  const [taskForm, setTaskForm] = useState({
    type: "exec",
    args: "",
  })

  // Fetch implants on mount
  useEffect(() => {
    fetchImplants()
  }, [])

  // Fetch tasks when implant is selected
  useEffect(() => {
    if (selectedImplant) {
      fetchImplantTasks(selectedImplant.implantId)
    }
  }, [selectedImplant])

  const fetchImplants = async () => {
    try {
      const response = await apiFetch("/api/admin/implants")
      if (!response.ok) throw new Error("Failed to fetch implants")
      const data = await response.json()
      setImplants(data.implants || [])
    } catch (error) {
      console.error("Failed to fetch implants:", error)
      toast.error("Failed to load implants")
    } finally {
      setLoading(false)
    }
  }

  const fetchImplantTasks = async (implantId: string) => {
    try {
      const response = await apiFetch(`/api/admin/implants/${selectedImplant?.id}`)
      if (!response.ok) throw new Error("Failed to fetch implant tasks")
      const data = await response.json()
      setImplantTasks(data.tasks || [])
    } catch (error) {
      console.error("Failed to fetch implant tasks:", error)
    }
  }

  const handleCreateImplant = async () => {
    if (!form.name.trim()) return

    try {
      const response = await apiFetch("/api/admin/implants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          architecture: form.architecture,
          targetId: form.targetId || undefined,
          config: {},
          transportConfig: {},
        }),
      })

      if (!response.ok) throw new Error("Failed to create implant")

      toast.success("Implant created successfully")
      setCreateOpen(false)
      setForm({ name: "", type: "windows-exe", architecture: "amd64", targetId: "" })
      await fetchImplants()
    } catch (error) {
      console.error("Failed to create implant:", error)
      toast.error("Failed to create implant")
    }
  }

  const handleSendTask = async () => {
    if (!selectedImplant || !taskForm.type.trim()) return

    try {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(taskForm.args)
      } catch {
        args = { command: taskForm.args }
      }

      const response = await apiFetch(`/api/admin/implants/${selectedImplant.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: taskForm.type,
          args,
        }),
      })

      if (!response.ok) throw new Error("Failed to send task")

      toast.success("Task sent to implant")
      setTaskOpen(false)
      setTaskForm({ type: "exec", args: "" })
      await fetchImplantTasks(selectedImplant.implantId)
    } catch (error) {
      console.error("Failed to send task:", error)
      toast.error("Failed to send task")
    }
  }

  const getStatusIcon = (status: ImplantStatus) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-success" />
      case "inactive":
        return <Clock className="h-4 w-4 text-warning" />
      case "compromised":
        return <AlertTriangle className="h-4 w-4 text-destructive" />
      case "exited":
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getTaskStatusBadge = (status: TaskStatus) => {
    const variants: Record<TaskStatus, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      running: "secondary",
      completed: "default",
      failed: "destructive",
    }
    return variants[status] || "outline"
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-xl">Implant Management</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Monitor and manage deployed implants, send tasks, and view results.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-heading-lg">{implants.length}</p>
              <p className="text-caption text-muted-foreground">Total Implants</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-heading-lg">{implants.filter((i) => i.status === "active").length}</p>
              <p className="text-caption text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-heading-lg">{implants.filter((i) => i.status === "inactive").length}</p>
              <p className="text-caption text-muted-foreground">Inactive</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-heading-lg">{implants.filter((i) => i.status === "compromised").length}</p>
              <p className="text-caption text-muted-foreground">Compromised</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Implants list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Deployed Implants</CardTitle>
                <CardDescription>Active and registered implants</CardDescription>
              </div>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger render={<Button />}>
                  <Plus className="mr-2 h-4 w-4" />
                  Register Implant
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Register New Implant</DialogTitle>
                    <DialogDescription>
                      Register a new implant for tracking and task management.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="implant-name">Implant Name</Label>
                      <Input
                        id="implant-name"
                        placeholder="e.g. Corp-Financial-Workstation-01"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="windows-exe">Windows EXE</SelectItem>
                            <SelectItem value="linux-elf">Linux ELF</SelectItem>
                            <SelectItem value="macos-dylib">macOS Dylib</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Architecture</Label>
                        <Select value={form.architecture} onValueChange={(v) => setForm((f) => ({ ...f, architecture: v ?? f.architecture }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amd64">x64 (amd64)</SelectItem>
                            <SelectItem value="386">x86 (386)</SelectItem>
                            <SelectItem value="arm64">ARM64</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target-id">Target ID (optional)</Label>
                      <Input
                        id="target-id"
                        placeholder="e.g. target-12345"
                        value={form.targetId}
                        onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      Cancel
                    </DialogClose>
                    <Button onClick={handleCreateImplant} disabled={!form.name.trim()}>
                      Register Implant
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {implants.length === 0 && (
                <p className="text-body-sm text-muted-foreground">No implants registered yet.</p>
              )}
              {implants.map((implant) => (
                <div
                  key={implant.id}
                  className={`flex items-center justify-between rounded-lg border p-4 transition-colors cursor-pointer ${
                    selectedImplant?.id === implant.id ? "bg-muted/50 border-primary" : "hover:bg-muted/30"
                  }`}
                  onClick={() => setSelectedImplant(implant)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {getStatusIcon(implant.status)}
                    </div>
                    <div>
                      <h3 className="text-heading-sm">{implant.name}</h3>
                      <p className="text-caption text-muted-foreground">
                        {implant.type} · {implant.architecture} · {implant.implantId.slice(0, 8)}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        Last seen: {implant.lastSeen ? new Date(implant.lastSeen).toLocaleString() : "Never"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={implant.status === "active" ? "default" : "secondary"}>
                    {implant.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Task panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Task Queue</CardTitle>
                <CardDescription>
                  {selectedImplant ? selectedImplant.name : "Select an implant"}
                </CardDescription>
              </div>
              {selectedImplant && (
                <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
                  <DialogTrigger render={<Button size="sm" />}>
                    <Send className="mr-2 h-3 w-3" />
                    Send Task
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Send Task to Implant</DialogTitle>
                      <DialogDescription>
                        Send a command or task to {selectedImplant.name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Task Type</Label>
                        <Select value={taskForm.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exec">Execute Command</SelectItem>
                            <SelectItem value="info">System Information</SelectItem>
                            <SelectItem value="sleep">Change Sleep Interval</SelectItem>
                            <SelectItem value="download">Download File</SelectItem>
                            <SelectItem value="upload">Upload File</SelectItem>
                            <SelectItem value="screenshot">Screenshot</SelectItem>
                            <SelectItem value="kill">Kill Implant</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="task-args">Arguments (JSON or plain text)</Label>
                        <Textarea
                          id="task-args"
                          placeholder='{"command": "whoami"} or just "whoami"'
                          value={taskForm.args}
                          onChange={(e) => setTaskForm((f) => ({ ...f, args: e.target.value }))}
                          rows={4}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>
                        Cancel
                      </DialogClose>
                      <Button onClick={handleSendTask} disabled={!taskForm.type.trim()}>
                        Send Task
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {!selectedImplant && (
                <p className="text-body-sm text-muted-foreground">Select an implant to view tasks.</p>
              )}
              {selectedImplant && implantTasks.length === 0 && (
                <p className="text-body-sm text-muted-foreground">No tasks for this implant yet.</p>
              )}
              {implantTasks.map((task) => (
                <div key={task.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-heading-sm">{task.type}</span>
                    <Badge variant={getTaskStatusBadge(task.status)} className="text-xs">
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-caption text-muted-foreground mb-2">
                    {new Date(task.createdAt).toLocaleString()}
                  </p>
                  {task.result && (
                    <div className="bg-muted p-2 rounded text-xs font-mono max-h-20 overflow-auto">
                      {JSON.stringify(task.result, null, 2)}
                    </div>
                  )}
                  {task.error && (
                    <div className="bg-destructive/10 text-destructive p-2 rounded text-xs">
                      {task.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}