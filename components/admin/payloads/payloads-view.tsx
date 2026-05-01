"use client"

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

type PayloadStatus = "pending" | "building" | "ready" | "failed"

interface Payload {
  id: string
  name: string
  type: string
  description?: string
  status: PayloadStatus
  config: any
  downloadUrl?: string
  sizeBytes?: number
  buildLogs: string[]
  errorMessage?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PayloadsView() {
  const [payloads, setPayloads] = useState<Payload[]>([])
  const [loading, setLoading] = useState(true)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    name: "",
    type: "windows_exe",
    description: "",
    obfuscation: true,
    antiAnalysis: true,
  })

  // Fetch payloads on mount
  useEffect(() => {
    fetchPayloads()
  }, [])

  const fetchPayloads = async () => {
    try {
      const response = await fetch("/api/admin/payloads")
      if (!response.ok) throw new Error("Failed to fetch payloads")
      const data = await response.json()
      setPayloads(data.builds || [])
    } catch (error) {
      console.error("Failed to fetch payloads:", error)
      toast.error("Failed to load payloads")
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = useCallback(async () => {
    if (!form.name.trim()) return
    setGenerating(true)

    try {
      const config = {
        type: form.type,
        name: form.name,
        description: form.description,
        hysteriaConfig: {
          server: "auto-detect",
          auth: "auto-generate",
        },
        obfuscation: {
          enabled: form.obfuscation,
          level: "medium",
          techniques: form.obfuscation ? ["string_encode", "variable_rename"] : [],
        },
        signing: {
          enabled: false,
        },
        features: {
          autoReconnect: true,
          heartbeat: 30,
          fallbackServers: [],
        },
      }

      const response = await fetch("/api/admin/payloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })

      if (!response.ok) throw new Error("Failed to create payload build")

      const build = await response.json()
      
      // Start the build process
      const buildResponse = await fetch(`/api/admin/payloads/${build.id}/build`, {
        method: "POST",
      })

      if (!buildResponse.ok) throw new Error("Failed to start build")

      toast.success("Payload generation started", {
        description: `${form.name} is being compiled…`,
      })

      setGenerateOpen(false)
      setForm({ name: "", type: "windows_exe", description: "", obfuscation: true, antiAnalysis: true })
      
      // Refresh the list
      await fetchPayloads()
    } catch (error) {
      console.error("Failed to generate payload:", error)
      toast.error("Failed to generate payload")
    } finally {
      setGenerating(false)
    }
  }, [form])

  const handleDownload = useCallback(async (payload: Payload) => {
    if (payload.status !== "ready") {
      toast.error("Payload not ready", { description: "Wait for the build to complete." })
      return
    }
    
    if (payload.downloadUrl) {
      window.open(payload.downloadUrl, "_blank")
      toast.success("Download started", {
        description: `Downloading ${payload.name}…`,
      })
    } else {
      toast.error("No download URL available")
    }
  }, [])

  const handleDelete = useCallback(async (payloadId: string) => {
    try {
      const response = await fetch(`/api/admin/payloads/${payloadId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete payload")

      toast.success("Payload deleted")
      await fetchPayloads()
    } catch (error) {
      console.error("Failed to delete payload:", error)
      toast.error("Failed to delete payload")
    }
  }, [])

  const handleRebuild = useCallback(async (payload: Payload) => {
    try {
      const response = await fetch(`/api/admin/payloads/${payload.id}/build`, {
        method: "POST",
      })

      if (!response.ok) throw new Error("Failed to start rebuild")

      toast.info("Rebuilding payload…", { description: payload.name })
      await fetchPayloads()
    } catch (error) {
      console.error("Failed to rebuild payload:", error)
      toast.error("Failed to rebuild payload")
    }
  }, [])

  // Stats
  const readyCount = payloads.filter((p) => p.status === "ready").length
  const buildingCount = payloads.filter((p) => p.status === "building").length
  const failedCount = payloads.filter((p) => p.status === "failed").length

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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
              <Shield className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-heading-lg">{failedCount}</p>
              <p className="text-caption text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payloads list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payload Builds</CardTitle>
              <CardDescription>Generated implant payloads with build status</CardDescription>
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

                  <div className="space-y-2">
                    <Label>Payload Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? f.type }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="windows_exe">Windows Executable (.exe)</SelectItem>
                        <SelectItem value="linux_elf">Linux ELF Binary</SelectItem>
                        <SelectItem value="macos_app">macOS App Bundle (.app)</SelectItem>
                        <SelectItem value="powershell">PowerShell Script (.ps1)</SelectItem>
                        <SelectItem value="python">Python Script (.py)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pl-desc">Description (optional)</Label>
                    <Input
                      id="pl-desc"
                      placeholder="e.g. Corporate stager for initial access"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
                      {payload.type} · {payload.sizeBytes ? `${(payload.sizeBytes / 1024 / 1024).toFixed(2)} MB` : "—"} · {new Date(payload.createdAt).toLocaleDateString()}
                    </p>
                    {payload.errorMessage && (
                      <p className="text-caption text-destructive mt-1">{payload.errorMessage}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      payload.status === "ready"
                        ? "default"
                        : payload.status === "building"
                          ? "secondary"
                          : payload.status === "failed"
                            ? "destructive"
                            : "outline"
                    }
                    className="gap-1.5"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        payload.status === "ready"
                          ? "bg-success"
                          : payload.status === "building"
                            ? "bg-warning animate-pulse"
                            : payload.status === "failed"
                              ? "bg-destructive"
                              : "bg-muted-foreground"
                      }`}
                    />
                    {payload.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(payload)}
                    disabled={payload.status !== "ready"}
                  >
                    <Download className="mr-1.5 h-3 w-3" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRebuild(payload)}
                    disabled={payload.status === "building"}
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
