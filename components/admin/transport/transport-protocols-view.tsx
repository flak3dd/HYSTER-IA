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
  Settings2,
  Power,
  PowerOff,
  Shield,
  Zap,
  Globe,
  Lock,
  Radio,
  Save,
  RotateCcw,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProtocolConfig {
  id: string
  name: string
  status: "Active" | "Inactive"
  description: string
  icon: React.ComponentType<{ className?: string }>
  settings: {
    port: string
    encryption: string
    obfuscation: string
    tls: boolean
    mux: boolean
    udp: boolean
  }
  encryptionOptions: string[]
  obfuscationOptions: string[]
}

/* ------------------------------------------------------------------ */
/*  Initial data                                                       */
/* ------------------------------------------------------------------ */

const INITIAL_PROTOCOLS: ProtocolConfig[] = [
  {
    id: "hysteria2",
    name: "Hysteria2",
    status: "Active",
    description: "UDP-based protocol with obfuscation",
    icon: Zap,
    settings: {
      port: "443",
      encryption: "AES-256-GCM",
      obfuscation: "Salamander",
      tls: true,
      mux: true,
      udp: true,
    },
    encryptionOptions: ["AES-256-GCM", "ChaCha20-Poly1305", "None"],
    obfuscationOptions: ["Salamander", "None"],
  },
  {
    id: "shadowsocks",
    name: "Shadowsocks",
    status: "Active",
    description: "Lightweight proxy protocol",
    icon: Shield,
    settings: {
      port: "8388",
      encryption: "AEAD-2022-BLAKE3-AES-256-GCM",
      obfuscation: "None",
      tls: false,
      mux: true,
      udp: true,
    },
    encryptionOptions: [
      "AEAD-2022-BLAKE3-AES-256-GCM",
      "AEAD-2022-BLAKE3-CHACHA20-POLY1305",
      "AES-256-GCM",
      "ChaCha20-IETF-Poly1305",
    ],
    obfuscationOptions: ["None", "Simple-Obfs HTTP", "Simple-Obfs TLS", "V2Ray Plugin"],
  },
  {
    id: "vmess",
    name: "VMess",
    status: "Inactive",
    description: "V2Ray protocol with encryption",
    icon: Globe,
    settings: {
      port: "10086",
      encryption: "Auto",
      obfuscation: "None",
      tls: false,
      mux: false,
      udp: true,
    },
    encryptionOptions: ["Auto", "AES-128-GCM", "ChaCha20-Poly1305", "None"],
    obfuscationOptions: ["None", "WebSocket", "HTTP/2", "gRPC", "QUIC"],
  },
  {
    id: "trojan",
    name: "Trojan",
    status: "Active",
    description: "HTTPS camouflaging protocol",
    icon: Lock,
    settings: {
      port: "443",
      encryption: "TLS 1.3",
      obfuscation: "None",
      tls: true,
      mux: false,
      udp: true,
    },
    encryptionOptions: ["TLS 1.3", "TLS 1.2"],
    obfuscationOptions: ["None", "WebSocket", "gRPC"],
  },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TransportProtocolsView() {
  const [protocols, setProtocols] = useState<ProtocolConfig[]>(INITIAL_PROTOCOLS)
  const [configOpen, setConfigOpen] = useState(false)
  const [selected, setSelected] = useState<ProtocolConfig | null>(null)

  // Editing state (a copy so we can cancel)
  const [editSettings, setEditSettings] = useState<ProtocolConfig["settings"] | null>(null)

  const handleConfigure = useCallback((proto: ProtocolConfig) => {
    setSelected(proto)
    setEditSettings({ ...proto.settings })
    setConfigOpen(true)
  }, [])

  const handleToggleStatus = useCallback((protoId: string) => {
    setProtocols((prev) =>
      prev.map((p) =>
        p.id === protoId
          ? { ...p, status: p.status === "Active" ? "Inactive" : "Active" }
          : p
      )
    )
  }, [])

  const handleSave = useCallback(() => {
    if (!selected || !editSettings) return
    setProtocols((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, settings: { ...editSettings } } : p
      )
    )
    setConfigOpen(false)
  }, [selected, editSettings])

  const handleReset = useCallback(() => {
    if (!selected) return
    setEditSettings({ ...selected.settings })
  }, [selected])

  const updateSetting = <K extends keyof ProtocolConfig["settings"]>(
    key: K,
    value: ProtocolConfig["settings"][K]
  ) => {
    setEditSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  // Stats
  const activeCount = protocols.filter((p) => p.status === "Active").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-xl">Multi-Transport Protocols</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Configure and manage transport protocols for secure communication channels.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Radio className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-heading-lg">{protocols.length}</p>
              <p className="text-caption text-muted-foreground">Total Protocols</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <Power className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-heading-lg">{activeCount}</p>
              <p className="text-caption text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <PowerOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-heading-lg">{protocols.length - activeCount}</p>
              <p className="text-caption text-muted-foreground">Inactive</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
              <Lock className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-heading-lg">
                {protocols.filter((p) => p.settings.tls).length}
              </p>
              <p className="text-caption text-muted-foreground">TLS Enabled</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Protocols list */}
      <Card>
        <CardHeader>
          <CardTitle>Protocol Configuration</CardTitle>
          <CardDescription>Manage transport protocol settings and encryption</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {protocols.map((proto) => {
              const Icon = proto.icon
              return (
                <div
                  key={proto.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-heading-sm">{proto.name}</h3>
                      <p className="text-caption text-muted-foreground">
                        {proto.description} · Port {proto.settings.port} · {proto.settings.encryption}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={proto.status === "Active" ? "default" : "secondary"}
                      className="gap-1.5"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          proto.status === "Active"
                            ? "bg-success animate-pulse"
                            : "bg-muted-foreground"
                        }`}
                      />
                      {proto.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleStatus(proto.id)}
                    >
                      {proto.status === "Active" ? (
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
                      onClick={() => handleConfigure(proto)}
                    >
                      <Settings2 className="mr-1.5 h-3 w-3" />
                      Configure
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Configure Sheet */}
      <Sheet open={configOpen} onOpenChange={setConfigOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          {selected && editSettings && (
            <>
              <SheetHeader>
                <SheetTitle>Configure {selected.name}</SheetTitle>
                <SheetDescription>{selected.description}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                {/* Port */}
                <div className="space-y-2">
                  <Label htmlFor="cfg-port">Listen Port</Label>
                  <Input
                    id="cfg-port"
                    value={editSettings.port}
                    onChange={(e) => updateSetting("port", e.target.value)}
                    placeholder="443"
                  />
                </div>

                {/* Encryption */}
                <div className="space-y-2">
                  <Label>Encryption Method</Label>
                  <Select
                    value={editSettings.encryption}
                    onValueChange={(v) => updateSetting("encryption", v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select encryption" />
                    </SelectTrigger>
                    <SelectContent>
                      {selected.encryptionOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Obfuscation */}
                <div className="space-y-2">
                  <Label>Obfuscation</Label>
                  <Select
                    value={editSettings.obfuscation}
                    onValueChange={(v) => updateSetting("obfuscation", v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select obfuscation" />
                    </SelectTrigger>
                    <SelectContent>
                      {selected.obfuscationOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body-sm font-medium">TLS Encryption</p>
                      <p className="text-caption text-muted-foreground">
                        Enable TLS for transport layer security
                      </p>
                    </div>
                    <Switch
                      checked={editSettings.tls}
                      onCheckedChange={(v) => updateSetting("tls", !!v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body-sm font-medium">Multiplexing (Mux)</p>
                      <p className="text-caption text-muted-foreground">
                        Multiplex connections over a single stream
                      </p>
                    </div>
                    <Switch
                      checked={editSettings.mux}
                      onCheckedChange={(v) => updateSetting("mux", !!v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body-sm font-medium">UDP Relay</p>
                      <p className="text-caption text-muted-foreground">
                        Allow UDP traffic over this protocol
                      </p>
                    </div>
                    <Switch
                      checked={editSettings.udp}
                      onCheckedChange={(v) => updateSetting("udp", !!v)}
                    />
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={handleSave}>
                    <Save className="mr-2 h-3.5 w-3.5" />
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
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
