"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api/fetch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export type SmtpConfigItem = {
  id: string
  name: string
  host: string
  port: number
  secure: boolean
  username: string | null
  fromEmail: string
  fromName: string | null
  isDefault: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export function SmtpConfigManager() {
  const [configs, setConfigs] = useState<SmtpConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<SmtpConfigItem | null>(null)

  // Form state
  const [formName, setFormName] = useState("")
  const [formHost, setFormHost] = useState("")
  const [formPort, setFormPort] = useState("587")
  const [formSecure, setFormSecure] = useState(false)
  const [formUsername, setFormUsername] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formFromEmail, setFormFromEmail] = useState("")
  const [formFromName, setFormFromName] = useState("")
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [formEnabled, setFormEnabled] = useState(true)

  const resetForm = useCallback(() => {
    setFormName("")
    setFormHost("")
    setFormPort("587")
    setFormSecure(false)
    setFormUsername("")
    setFormPassword("")
    setFormFromEmail("")
    setFormFromName("")
    setFormIsDefault(false)
    setFormEnabled(true)
    setEditing(null)
  }, [])

  const loadConfigs = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/mail/smtp-configs", { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setConfigs(data.configs ?? [])
    } catch (err) {
      toast.error("Failed to load SMTP configs", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const handleEdit = useCallback((config: SmtpConfigItem) => {
    setEditing(config)
    setFormName(config.name)
    setFormHost(config.host)
    setFormPort(String(config.port))
    setFormSecure(config.secure)
    setFormUsername(config.username ?? "")
    setFormFromEmail(config.fromEmail)
    setFormFromName(config.fromName ?? "")
    setFormIsDefault(config.isDefault)
    setFormEnabled(config.enabled)
    // Password is not returned from API, keep empty for edits
    setFormPassword("")
  }, [])

  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formHost.trim() || !formFromEmail.trim()) {
      toast.error("Name, host, and from email are required")
      return
    }

    const port = parseInt(formPort)
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error("Invalid port number")
      return
    }

    setSaving(true)
    try {
      const body = {
        name: formName.trim(),
        host: formHost.trim(),
        port,
        secure: formSecure,
        username: formUsername.trim() || undefined,
        password: formPassword || undefined,
        fromEmail: formFromEmail.trim(),
        fromName: formFromName.trim() || undefined,
        isDefault: formIsDefault,
        enabled: formEnabled,
      }

      const url = editing
        ? `/api/admin/mail/smtp-configs/${editing.id}`
        : "/api/admin/mail/smtp-configs"
      const method = editing ? "PATCH" : "POST"

      const res = await apiFetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? `${res.status}`)
      }

      toast.success(editing ? "SMTP config updated" : "SMTP config saved")
      resetForm()
      loadConfigs()
    } catch (err) {
      toast.error("Failed to save SMTP config", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSaving(false)
    }
  }, [
    editing, formName, formHost, formPort, formSecure, formUsername, formPassword,
    formFromEmail, formFromName, formIsDefault, formEnabled, resetForm, loadConfigs,
  ])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this SMTP configuration?")) return
    try {
      const res = await apiFetch(`/api/admin/mail/smtp-configs/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success("SMTP config deleted")
      loadConfigs()
      if (editing?.id === id) resetForm()
    } catch (err) {
      toast.error("Failed to delete SMTP config", {
        description: err instanceof Error ? err.message : "unknown",
      })
    }
  }, [editing, loadConfigs, resetForm])

  const handleTest = useCallback(async (id: string) => {
    setTestingId(id)
    try {
      const res = await apiFetch(`/api/admin/mail/smtp-configs/${id}/test`, {
        method: "POST",
      })
      const data = await res.json()
      if (data.ok) {
        toast.success("SMTP connection successful", {
          description: data.greeting ?? "Connected",
        })
      } else {
        throw new Error(data.error ?? "Connection failed")
      }
    } catch (err) {
      toast.error("SMTP test failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setTestingId(null)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading SMTP configurations...</p>
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Config list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Saved SMTP Configurations</CardTitle>
              <CardDescription className="text-xs">
                {configs.length} config{configs.length !== 1 && "s"} saved
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={resetForm} disabled={!editing}>
              New Config
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[520px] overflow-y-auto">
          {configs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No saved SMTP configurations. Use the form to add one.
            </p>
          ) : (
            configs.map((cfg) => (
              <div
                key={cfg.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  editing?.id === cfg.id ? "border-primary bg-muted/50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{cfg.name}</span>
                    {cfg.isDefault && (
                      <Badge variant="default" className="text-[10px]">Default</Badge>
                    )}
                    {!cfg.enabled && (
                      <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {cfg.host}:{cfg.port} {cfg.secure ? "(TLS)" : ""} &bull; {cfg.fromEmail}
                  </p>
                  {cfg.fromName && (
                    <p className="text-xs text-muted-foreground truncate">{cfg.fromName}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(cfg.id)}
                    disabled={testingId === cfg.id || !cfg.enabled}
                  >
                    {testingId === cfg.id ? "..." : "Test"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(cfg)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(cfg.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {editing ? "Edit SMTP Config" : "Add SMTP Config"}
          </CardTitle>
          <CardDescription className="text-xs">
            {editing
              ? "Update this SMTP configuration"
              : "Save a new SMTP server configuration for reuse"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Primary SMTP"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Host</Label>
              <Input
                value={formHost}
                onChange={(e) => setFormHost(e.target.value)}
                placeholder="smtp.example.com"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Port</Label>
              <Input
                value={formPort}
                onChange={(e) => setFormPort(e.target.value)}
                placeholder="587"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="user@example.com"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editing ? "Leave blank to keep current" : ""}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From Email</Label>
              <Input
                value={formFromEmail}
                onChange={(e) => setFormFromEmail(e.target.value)}
                placeholder="noreply@example.com"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Name</Label>
              <Input
                value={formFromName}
                onChange={(e) => setFormFromName(e.target.value)}
                placeholder="D-Panel"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <Switch checked={formSecure} onCheckedChange={setFormSecure} />
              <Label className="text-xs">Use TLS (SSL)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formIsDefault} onCheckedChange={setFormIsDefault} />
              <Label className="text-xs">Set as default</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label className="text-xs">Enabled</Label>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving || !formName.trim() || !formHost.trim() || !formFromEmail.trim()}
          >
            {saving ? "Saving..." : editing ? "Update Config" : "Save Config"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
