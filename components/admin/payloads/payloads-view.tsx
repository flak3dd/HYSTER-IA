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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Plus,
  Download,
  Trash2,
  RefreshCw,
  Package,
  FileCode2,
  Shield,
} from "lucide-react"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PayloadStatus = "Ready" | "Building" | "Error"

interface Payload {
  id: string
  name: string
  type: string
  os: string
  status: PayloadStatus
  size: string
  stealthLevel: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Seed data                                                          */
/* ------------------------------------------------------------------ */

const INITIAL_PAYLOADS: Payload[] = [
  {
    id: "pl_1",
    name: "Windows Executable",
    type: "EXE",
    os: "windows",
    status: "Ready",
    size: "2.4 MB",
    stealthLevel: "high",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "pl_2",
    name: "Linux ELF",
    type: "ELF",
    os: "linux",
    status: "Ready",
    size: "1.8 MB",
    stealthLevel: "high",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "pl_3",
    name: "macOS Bundle",
    type: "APP",
    os: "darwin",
    status: "Building",
    size: "3.1 MB",
    stealthLevel: "maximum",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "pl_4",
    name: "PowerShell Script",
    type: "PS1",
    os: "windows",
    status: "Ready",
    size: "12 KB",
    stealthLevel: "standard",
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: "pl_5",
    name: "Python Payload",
    type: "PY",
    os: "linux",
    status: "Ready",
    size: "8 KB",
    stealthLevel: "standard",
    createdAt: new Date(Date.now() - 432000000).toISOString(),
  },
]

const OS_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
  { value: "darwin", label: "macOS" },
]

const TYPE_OPTIONS = [
  { value: "EXE", label: "Windows Executable (.exe)" },
  { value: "ELF", label: "Linux ELF Binary" },
  { value: "APP", label: "macOS App Bundle (.app)" },
  { value: "PS1", label: "PowerShell Script (.ps1)" },
  { value: "PY", label: "Python Script (.py)" },
  { value: "SH", label: "Shell Script (.sh)" },
  { value: "DLL", label: "Dynamic Library (.dll)" },
]

const STEALTH_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
  { value: "maximum", label: "Maximum" },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PayloadsView() {
  const [payloads, setPayloads] = useState<Payload[]>(INITIAL_PAYLOADS)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    name: "",
    os: "windows",
    type: "EXE",
    stealthLevel: "high",
    obfuscation: true,
    antiAnalysis: true,
    customSni: "",
  })

  const handleGenerate = useCallback(() => {
    if (!form.name.trim()) return
    setGenerating(true)

    // Simulate build process
    const newPayload: Payload = {
      id: `pl_${Date.now()}`,
      name: form.name.trim(),
      type: form.type,
      os: form.os,
      status: "Building",
      size: "—",
      stealthLevel: form.stealthLevel,
      createdAt: new Date().toISOString(),
    }

    setPayloads((prev) => [newPayload, ...prev])
    toast.success("Payload generation started", {
      description: `${form.name} (${form.type}) is being compiled…`,
    })

    // Simulate build completing after 3 seconds
    setTimeout(() => {
      setPayloads((prev) =>
        prev.map((p) =>
          p.id === newPayload.id
            ? { ...p, status: "Ready" as PayloadStatus, size: `${(Math.random() * 4 + 0.5).toFixed(1)} MB` }
            : p
        )
      )
      toast.success("Payload ready", { description: `${form.name} compiled successfully.` })
    }, 3000)

    setGenerating(false)
    setGenerateOpen(false)
    setForm({ name: "", os: "windows", type: "EXE", stealthLevel: "high", obfuscation: true, antiAnalysis: true, customSni: "" })
  }, [form])

  const handleDownload = useCallback((payload: Payload) => {
    if (payload.status !== "Ready") {
      toast.error("Payload not ready", { description: "Wait for the build to complete." })
      return
    }
    toast.success("Download started", {
      description: `Downloading ${payload.name} (${payload.size})…`,
    })
  }, [])

  const handleDelete = useCallback((payloadId: string) => {
    setPayloads((prev) => prev.filter((p) => p.id !== payloadId))
    toast.success("Payload deleted")
  }, [])

  const handleRebuild = useCallback((payload: Payload) => {
    setPayloads((prev) =>
      prev.map((p) =>
        p.id === payload.id ? { ...p, status: "Building" as PayloadStatus, size: "—" } : p
      )
    )
    toast.info("Rebuilding payload…", { description: payload.name })

    setTimeout(() => {
      setPayloads((prev) =>
        prev.map((p) =>
          p.id === payload.id
            ? { ...p, status: "Ready" as PayloadStatus, size: `${(Math.random() * 4 + 0.5).toFixed(1)} MB` }
            : p
        )
      )
      toast.success("Rebuild complete", { description: payload.name })
    }, 3000)
  }, [])

  // Stats
  const readyCount = payloads.filter((p) => p.status === "Ready").length
  const buildingCount = payloads.filter((p) => p.status === "Building").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-xl">Dynamic Payload Generation</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Generate and manage custom payloads for various platforms and scenarios.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-heading-lg">{payloads.length}</p>
              <p className="text-caption text-muted-foreground">Total Payloads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <FileCode2 className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-heading-lg">{readyCount}</p>
              <p className="text-caption text-muted-foreground">Ready</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
              <RefreshCw className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-heading-lg">{buildingCount}</p>
              <p className="text-caption text-muted-foreground">Building</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
              <Shield className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-heading-lg">
                {payloads.filter((p) => p.stealthLevel === "maximum" || p.stealthLevel === "high").length}
              </p>
              <p className="text-caption text-muted-foreground">High Stealth</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payloads list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payload Templates</CardTitle>
              <CardDescription>Pre-configured payload templates for rapid deployment</CardDescription>
            </div>
            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
              <DialogTrigger render={<Button />}>
                <Plus className="mr-2 h-4 w-4" />
                Generate New Payload
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Generate New Payload</DialogTitle>
                  <DialogDescription>
                    Configure and compile a new implant payload with stealth features.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="pl-name">Payload Name</Label>
                    <Input
                      id="pl-name"
                      placeholder="e.g. Corp-Win-Stager"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Target OS</Label>
                      <Select value={form.os} onValueChange={(v) => setForm((f) => ({ ...f, os: v ?? f.os }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Output Format</Label>
                      <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Stealth Level</Label>
                    <Select value={form.stealthLevel} onValueChange={(v) => setForm((f) => ({ ...f, stealthLevel: v ?? f.stealthLevel }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STEALTH_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pl-sni">Custom SNI (optional)</Label>
                    <Input
                      id="pl-sni"
                      placeholder="e.g. www.microsoft.com"
                      value={form.customSni}
                      onChange={(e) => setForm((f) => ({ ...f, customSni: e.target.value }))}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-body-sm font-medium">Code Obfuscation</p>
                        <p className="text-caption text-muted-foreground">
                          Apply binary obfuscation techniques
                        </p>
                      </div>
                      <Switch
                        checked={form.obfuscation}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, obfuscation: !!v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-body-sm font-medium">Anti-Analysis</p>
                        <p className="text-caption text-muted-foreground">
                          VM / debugger / sandbox detection
                        </p>
                      </div>
                      <Switch
                        checked={form.antiAnalysis}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, antiAnalysis: !!v }))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={handleGenerate}
                    disabled={!form.name.trim() || generating}
                  >
                    {generating ? "Generating…" : "Generate Payload"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {payloads.length === 0 && (
              <p className="text-body-sm text-muted-foreground">No payloads generated yet.</p>
            )}
            {payloads.map((payload) => (
              <div
                key={payload.id}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileCode2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-heading-sm">{payload.name}</h3>
                    <p className="text-caption text-muted-foreground">
                      {payload.type} · {payload.os} · {payload.size} · Stealth: {payload.stealthLevel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      payload.status === "Ready"
                        ? "default"
                        : payload.status === "Building"
                          ? "secondary"
                          : "destructive"
                    }
                    className="gap-1.5"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        payload.status === "Ready"
                          ? "bg-success"
                          : payload.status === "Building"
                            ? "bg-warning animate-pulse"
                            : "bg-destructive"
                      }`}
                    />
                    {payload.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(payload)}
                    disabled={payload.status !== "Ready"}
                  >
                    <Download className="mr-1.5 h-3 w-3" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRebuild(payload)}
                    disabled={payload.status === "Building"}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    Rebuild
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(payload.id)}
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
    </div>
  )
}
