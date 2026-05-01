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
import { Switch } from "@/components/ui/switch"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  Settings2,
  Terminal,
  ShieldAlert,
  Wrench,
  Save,
  RotateCcw,
  Trash2,
  Power,
  PowerOff,
} from "lucide-react"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RiskLevel = "Low" | "Medium" | "High" | "Critical"
type ToolStatus = "Available" | "Disabled" | "Restricted"

interface LotlTool {
  id: string
  name: string
  category: string
  status: ToolStatus
  risk: RiskLevel
  usage: string
  description: string
  binaryPath: string
  args: string
  requiresApproval: boolean
}

/* ------------------------------------------------------------------ */
/*  Seed data                                                          */
/* ------------------------------------------------------------------ */

const INITIAL_TOOLS: LotlTool[] = [
  {
    id: "lotl_1",
    name: "PowerShell",
    category: "Scripting",
    status: "Available",
    risk: "Medium",
    usage: "High",
    description: "Windows PowerShell for scripting and automation tasks.",
    binaryPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    args: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden",
    requiresApproval: false,
  },
  {
    id: "lotl_2",
    name: "WMIC",
    category: "System Info",
    status: "Available",
    risk: "Low",
    usage: "Medium",
    description: "Windows Management Instrumentation Command-line for system queries.",
    binaryPath: "C:\\Windows\\System32\\wbem\\WMIC.exe",
    args: "",
    requiresApproval: false,
  },
  {
    id: "lotl_3",
    name: "Certutil",
    category: "File Operations",
    status: "Available",
    risk: "Medium",
    usage: "High",
    description: "Certificate utility that can download files and encode/decode data.",
    binaryPath: "C:\\Windows\\System32\\certutil.exe",
    args: "-urlcache -split -f",
    requiresApproval: false,
  },
  {
    id: "lotl_4",
    name: "Bitsadmin",
    category: "File Transfer",
    status: "Available",
    risk: "High",
    usage: "Medium",
    description: "Background Intelligent Transfer Service for stealthy file downloads.",
    binaryPath: "C:\\Windows\\System32\\bitsadmin.exe",
    args: "/transfer /priority high",
    requiresApproval: true,
  },
  {
    id: "lotl_5",
    name: "Schtasks",
    category: "Scheduling",
    status: "Available",
    risk: "High",
    usage: "High",
    description: "Task scheduler for persistence and timed execution.",
    binaryPath: "C:\\Windows\\System32\\schtasks.exe",
    args: "/create /sc minute /mo 30",
    requiresApproval: true,
  },
]

const CATEGORY_OPTIONS = [
  "Scripting",
  "System Info",
  "File Operations",
  "File Transfer",
  "Scheduling",
  "Networking",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
]

const RISK_OPTIONS: RiskLevel[] = ["Low", "Medium", "High", "Critical"]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LotlArsenalView() {
  const [tools, setTools] = useState<LotlTool[]>(INITIAL_TOOLS)
  const [addOpen, setAddOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [selected, setSelected] = useState<LotlTool | null>(null)
  const [editTool, setEditTool] = useState<LotlTool | null>(null)

  // Add form
  const [addForm, setAddForm] = useState({
    name: "",
    category: "Scripting",
    risk: "Medium" as RiskLevel,
    description: "",
    binaryPath: "",
  })

  const handleAddTool = useCallback(() => {
    if (!addForm.name.trim() || !addForm.binaryPath.trim()) return

    const newTool: LotlTool = {
      id: `lotl_${Date.now()}`,
      name: addForm.name.trim(),
      category: addForm.category,
      status: "Available",
      risk: addForm.risk,
      usage: "Low",
      description: addForm.description.trim(),
      binaryPath: addForm.binaryPath.trim(),
      args: "",
      requiresApproval: addForm.risk === "High" || addForm.risk === "Critical",
    }

    setTools((prev) => [newTool, ...prev])
    toast.success("Tool added", { description: `${addForm.name} added to arsenal.` })
    setAddOpen(false)
    setAddForm({ name: "", category: "Scripting", risk: "Medium", description: "", binaryPath: "" })
  }, [addForm])

  const handleConfigure = useCallback((tool: LotlTool) => {
    setSelected(tool)
    setEditTool({ ...tool })
    setConfigOpen(true)
  }, [])

  const handleSaveConfig = useCallback(() => {
    if (!editTool) return
    setTools((prev) => prev.map((t) => (t.id === editTool.id ? { ...editTool } : t)))
    toast.success("Configuration saved", { description: editTool.name })
    setConfigOpen(false)
  }, [editTool])

  const handleResetConfig = useCallback(() => {
    if (!selected) return
    setEditTool({ ...selected })
  }, [selected])

  const handleToggleStatus = useCallback((toolId: string) => {
    setTools((prev) =>
      prev.map((t) =>
        t.id === toolId
          ? { ...t, status: t.status === "Available" ? "Disabled" : "Available" }
          : t
      )
    )
  }, [])

  const handleDelete = useCallback((toolId: string) => {
    setTools((prev) => prev.filter((t) => t.id !== toolId))
    toast.success("Tool removed from arsenal")
  }, [])

  // Stats
  const availableCount = tools.filter((t) => t.status === "Available").length
  const highRiskCount = tools.filter((t) => t.risk === "High" || t.risk === "Critical").length

  const riskVariant = (risk: RiskLevel) => {
    switch (risk) {
      case "Low": return "secondary" as const
      case "Medium": return "default" as const
      case "High": return "destructive" as const
      case "Critical": return "destructive" as const
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-xl">Living-off-the-Land Arsenal</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Curated collection of legitimate tools and binaries for stealth operations.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Wrench className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-heading-lg">{tools.length}</p>
              <p className="text-caption text-muted-foreground">Total Tools</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <Terminal className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-heading-lg">{availableCount}</p>
              <p className="text-caption text-muted-foreground">Available</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
              <ShieldAlert className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-heading-lg">{highRiskCount}</p>
              <p className="text-caption text-muted-foreground">High Risk</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <PowerOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-heading-lg">{tools.length - availableCount}</p>
              <p className="text-caption text-muted-foreground">Disabled</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tools list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>LotL Tools Registry</CardTitle>
              <CardDescription>Manage legitimate tools for covert operations</CardDescription>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger render={<Button />}>
                <Plus className="mr-2 h-4 w-4" />
                Add Tool
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add LotL Tool</DialogTitle>
                  <DialogDescription>
                    Register a legitimate system binary for the arsenal.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="tool-name">Tool Name</Label>
                    <Input
                      id="tool-name"
                      placeholder="e.g. Rundll32"
                      value={addForm.name}
                      onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tool-path">Binary Path</Label>
                    <Input
                      id="tool-path"
                      placeholder="e.g. C:\\Windows\\System32\\rundll32.exe"
                      value={addForm.binaryPath}
                      onChange={(e) => setAddForm((f) => ({ ...f, binaryPath: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={addForm.category} onValueChange={(v) => setAddForm((f) => ({ ...f, category: v ?? f.category }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Risk Level</Label>
                      <Select value={addForm.risk} onValueChange={(v) => setAddForm((f) => ({ ...f, risk: (v ?? f.risk) as RiskLevel }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tool-desc">Description</Label>
                    <Textarea
                      id="tool-desc"
                      placeholder="Brief description of the tool and its usage…"
                      value={addForm.description}
                      onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={handleAddTool}
                    disabled={!addForm.name.trim() || !addForm.binaryPath.trim()}
                  >
                    Add Tool
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tools.length === 0 && (
              <p className="text-body-sm text-muted-foreground">No tools in arsenal.</p>
            )}
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-heading-sm">{tool.name}</h3>
                    <p className="text-caption text-muted-foreground">
                      {tool.category} · Risk: {tool.risk} · Usage: {tool.usage}
                      {tool.requiresApproval && " · 🔒 Approval Required"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={riskVariant(tool.risk)} className="gap-1.5">
                    {tool.risk}
                  </Badge>
                  <Badge
                    variant={tool.status === "Available" ? "default" : "secondary"}
                    className="gap-1.5"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        tool.status === "Available"
                          ? "bg-success"
                          : "bg-muted-foreground"
                      }`}
                    />
                    {tool.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleStatus(tool.id)}
                  >
                    {tool.status === "Available" ? (
                      <>
                        <PowerOff className="mr-1.5 h-3 w-3" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Power className="mr-1.5 h-3 w-3" />
                        Enable
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfigure(tool)}
                  >
                    <Settings2 className="mr-1.5 h-3 w-3" />
                    Configure
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(tool.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configure Sheet */}
      <Sheet open={configOpen} onOpenChange={setConfigOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          {editTool && (
            <>
              <SheetHeader>
                <SheetTitle>Configure {editTool.name}</SheetTitle>
                <SheetDescription>{editTool.description}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                <div className="space-y-2">
                  <Label htmlFor="cfg-path">Binary Path</Label>
                  <Input
                    id="cfg-path"
                    value={editTool.binaryPath}
                    onChange={(e) => setEditTool((t) => t ? { ...t, binaryPath: e.target.value } : t)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-args">Default Arguments</Label>
                  <Input
                    id="cfg-args"
                    placeholder="e.g. -NoProfile -ExecutionPolicy Bypass"
                    value={editTool.args}
                    onChange={(e) => setEditTool((t) => t ? { ...t, args: e.target.value } : t)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={editTool.category}
                      onValueChange={(v) => setEditTool((t) => t ? { ...t, category: v ?? t.category } : t)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Risk Level</Label>
                    <Select
                      value={editTool.risk}
                      onValueChange={(v) => setEditTool((t) => t ? { ...t, risk: (v ?? t.risk) as RiskLevel } : t)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-desc">Description</Label>
                  <Textarea
                    id="cfg-desc"
                    value={editTool.description}
                    onChange={(e) => setEditTool((t) => t ? { ...t, description: e.target.value } : t)}
                    rows={3}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-body-sm font-medium">Require Approval</p>
                    <p className="text-caption text-muted-foreground">
                      Require manual approval before execution
                    </p>
                  </div>
                  <Switch
                    checked={editTool.requiresApproval}
                    onCheckedChange={(v) => setEditTool((t) => t ? { ...t, requiresApproval: !!v } : t)}
                  />
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleSaveConfig}>
                    <Save className="mr-2 h-3.5 w-3.5" />
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={handleResetConfig}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
