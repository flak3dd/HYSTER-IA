"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Section types                                                      */
/* ------------------------------------------------------------------ */

type ServerConfig = {
  listen: string
  tls: { mode: string; certPath?: string; keyPath?: string; domains?: string[]; email?: string }
  obfs?: { type: string; password: string }
  bandwidth?: { up?: string; down?: string }
  masquerade?: { type: string; proxy?: { url: string; rewriteHost: boolean }; file?: { dir: string }; string?: { content: string; headers?: Record<string, string>; statusCode: number } }
  trafficStats: { listen: string; secret: string }
  authBackendUrl: string
  authBackendInsecure: boolean
  updatedAt: number
}

type EnvSection = {
  hysteria: Record<string, string | null>
  llm: Record<string, string | null>
  agent: Record<string, string | null>
  session: Record<string, string | null>
  database: Record<string, string | null>
  providers: Record<string, string | null>
  proxy: Record<string, string | null>
}

type MailerConfig = {
  workers: number
  delay_ms: number
  max_msgs_per_account: number
}

type AllSections = {
  server: ServerConfig | null
  environment: EnvSection
  mailer: MailerConfig | null
}

type TabId = "server" | "providers" | "environment" | "mailer" | "danger"

const TABS: { id: TabId; label: string; desc: string }[] = [
  { id: "server", label: "Hysteria2 Server", desc: "Core server configuration" },
  { id: "providers", label: "Provider Keys", desc: "VPS provider API keys" },
  { id: "environment", label: "Environment", desc: "Runtime environment variables (read-only)" },
  { id: "mailer", label: "Mail System", desc: "Mailer worker settings" },
  { id: "danger", label: "Danger Mode", desc: "Disable safety checks and approvals" },
]

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const [sections, setSections] = useState<AllSections | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>("server")
  const [saving, setSaving] = useState(false)

  // Editable copies
  const [serverDraft, setServerDraft] = useState<ServerConfig | null>(null)
  const [mailerDraft, setMailerDraft] = useState<MailerConfig | null>(null)

  // Danger mode settings
  const [dangerMode, setDangerMode] = useState({
    disableAIGuardRails: false,
    bypassDeploymentApprovals: false,
  })

  const loadRef = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/config/universal", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.sections as AllSections
    } catch (err) {
      toast.error("Failed to load settings", { description: err instanceof Error ? err.message : "Unknown" })
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadRef().then((s) => {
      if (cancelled) return
      if (!s) return
      setSections(s)
      setServerDraft(s.server ? { ...s.server } : null)
      setMailerDraft(s.mailer ? { ...s.mailer } : null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [loadRef])

  const reload = useCallback(async () => {
    setLoading(true)
    const s = await loadRef()
    if (s) {
      setSections(s)
      setServerDraft(s.server ? { ...s.server } : null)
      setMailerDraft(s.mailer ? { ...s.mailer } : null)
    }
    setLoading(false)
  }, [loadRef])

  const saveSection = useCallback(async (section: string, data: unknown) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/config/universal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, data }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`)
      }
      toast.success(`${section} config saved`)
      await reload()
    } catch (err) {
      toast.error("Save failed", { description: err instanceof Error ? err.message : "Unknown" })
    } finally {
      setSaving(false)
    }
  }, [reload])

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading settings...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-xl">Universal Settings</h1>
        <p className="text-sm text-muted-foreground">
          View and edit all system configurations in one place.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "server" && (
        <ServerSection
          config={serverDraft}
          onChange={setServerDraft}
          onSave={() => serverDraft && saveSection("server", serverDraft)}
          saving={saving}
        />
      )}
      {activeTab === "providers" && (
        <ProviderKeysSection />
      )}
      {activeTab === "environment" && sections?.environment && (
        <EnvironmentSection env={sections.environment} />
      )}
      {activeTab === "mailer" && (
        <MailerSection
          config={mailerDraft}
          onChange={setMailerDraft}
          onSave={() => mailerDraft && saveSection("mailer", mailerDraft)}
          saving={saving}
        />
      )}
      {activeTab === "danger" && (
        <DangerModeSection
          dangerMode={dangerMode}
          onChange={setDangerMode}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Server config section                                              */
/* ------------------------------------------------------------------ */

function ServerSection({
  config,
  onChange,
  onSave,
  saving,
}: {
  config: ServerConfig | null
  onChange: (c: ServerConfig) => void
  onSave: () => void
  saving: boolean
}) {
  if (!config) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No server configuration found.</p>
          <p className="mt-1 text-xs text-muted-foreground">Configure the Hysteria2 server first from the Transport page.</p>
        </CardContent>
      </Card>
    )
  }

  const update = (patch: Partial<ServerConfig>) => onChange({ ...config, ...patch })

  return (
    <div className="space-y-4">
      {/* Listener & Auth */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Network & Authentication</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Listen address" value={config.listen} onChange={(v) => update({ listen: v })} />
          <Field label="Auth backend URL" value={config.authBackendUrl} onChange={(v) => update({ authBackendUrl: v })} />
          <ToggleField
            label="Auth backend insecure (skip TLS verify)"
            checked={config.authBackendInsecure}
            onChange={(v) => update({ authBackendInsecure: v })}
          />
        </CardContent>
      </Card>

      {/* TLS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">TLS</CardTitle>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            Mode: <Badge variant="outline" className="text-[10px]">{config.tls.mode}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {config.tls.mode === "manual" && (
            <>
              <Field label="Certificate path" value={config.tls.certPath ?? ""} onChange={(v) => update({ tls: { ...config.tls, certPath: v } })} />
              <Field label="Key path" value={config.tls.keyPath ?? ""} onChange={(v) => update({ tls: { ...config.tls, keyPath: v } })} />
            </>
          )}
          {config.tls.mode === "acme" && (
            <>
              <Field label="Domains (comma-separated)" value={(config.tls.domains ?? []).join(", ")} onChange={(v) => update({ tls: { ...config.tls, mode: "acme" as const, domains: v.split(",").map(s => s.trim()).filter(Boolean), email: config.tls.email ?? "" } })} />
              <Field label="ACME email" value={config.tls.email ?? ""} onChange={(v) => update({ tls: { ...config.tls, mode: "acme" as const, domains: config.tls.domains ?? [], email: v } })} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Obfuscation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Obfuscation</CardTitle>
          <CardDescription className="text-xs">
            {config.obfs ? "Salamander enabled" : "Disabled"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ToggleField
            label="Enable salamander obfuscation"
            checked={!!config.obfs}
            onChange={(v) => update({ obfs: v ? { type: "salamander", password: config.obfs?.password ?? "" } : undefined })}
          />
          {config.obfs && (
            <Field label="Obfs password" value={config.obfs.password} onChange={(v) => update({ obfs: { type: "salamander", password: v } })} type="password" />
          )}
        </CardContent>
      </Card>

      {/* Bandwidth */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Bandwidth Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Upload limit (e.g. 100 mbps)" value={config.bandwidth?.up ?? ""} onChange={(v) => update({ bandwidth: { ...config.bandwidth, up: v || undefined } })} placeholder="No limit" />
          <Field label="Download limit (e.g. 500 mbps)" value={config.bandwidth?.down ?? ""} onChange={(v) => update({ bandwidth: { ...config.bandwidth, down: v || undefined } })} placeholder="No limit" />
        </CardContent>
      </Card>

      {/* Masquerade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Masquerade</CardTitle>
          <CardDescription className="text-xs">
            {config.masquerade ? `Type: ${config.masquerade.type}` : "Disabled"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Mode</label>
            <select
              value={config.masquerade?.type ?? "none"}
              onChange={(e) => {
                const val = e.target.value
                if (val === "none") { update({ masquerade: undefined }); return }
                if (val === "proxy") update({ masquerade: { type: "proxy", proxy: { url: config.masquerade?.proxy?.url ?? "https://www.google.com", rewriteHost: true } } })
                if (val === "file") update({ masquerade: { type: "file", file: { dir: config.masquerade?.file?.dir ?? "/var/www/html" } } })
                if (val === "string") update({ masquerade: { type: "string", string: { content: config.masquerade?.string?.content ?? "OK", statusCode: 200 } } })
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="none">Disabled</option>
              <option value="proxy">Proxy</option>
              <option value="file">File</option>
              <option value="string">String</option>
            </select>
          </div>
          {config.masquerade?.type === "proxy" && config.masquerade.proxy && (
            <>
              <Field label="Proxy target URL" value={config.masquerade.proxy.url} onChange={(v) => update({ masquerade: { ...config.masquerade!, proxy: { ...config.masquerade!.proxy!, url: v } } })} />
              <ToggleField label="Rewrite Host header" checked={config.masquerade.proxy.rewriteHost} onChange={(v) => update({ masquerade: { ...config.masquerade!, proxy: { ...config.masquerade!.proxy!, rewriteHost: v } } })} />
            </>
          )}
          {config.masquerade?.type === "file" && config.masquerade.file && (
            <Field label="File directory" value={config.masquerade.file.dir} onChange={(v) => update({ masquerade: { ...config.masquerade!, file: { dir: v } } })} />
          )}
          {config.masquerade?.type === "string" && config.masquerade.string && (
            <>
              <Field label="Response content" value={config.masquerade.string.content} onChange={(v) => update({ masquerade: { ...config.masquerade!, string: { ...config.masquerade!.string!, content: v } } })} />
              <Field label="Status code" value={String(config.masquerade.string.statusCode)} onChange={(v) => update({ masquerade: { ...config.masquerade!, string: { ...config.masquerade!.string!, statusCode: parseInt(v) || 200 } } })} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Traffic Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Traffic Stats API</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Listen address" value={config.trafficStats.listen} onChange={(v) => update({ trafficStats: { ...config.trafficStats, listen: v } })} />
          <Field label="API secret" value={config.trafficStats.secret} onChange={(v) => update({ trafficStats: { ...config.trafficStats, secret: v } })} type="password" />
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} size="lg">
          {saving ? "Saving..." : "Save Server Config"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Environment section (read-only)                                    */
/* ------------------------------------------------------------------ */

function EnvironmentSection({ env }: { env: EnvSection }) {
  const groups: { label: string; entries: Record<string, string | null> }[] = [
    { label: "Hysteria2 Binary", entries: env.hysteria },
    { label: "LLM / AI Provider", entries: env.llm },
    { label: "Agent Settings", entries: env.agent },
    { label: "Session", entries: env.session },
    { label: "Database", entries: env.database },
    { label: "VPS Providers", entries: env.providers },
    { label: "Proxy", entries: env.proxy },
  ]

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30">
        <CardContent className="py-3">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Environment variables are read-only. Edit your <code className="rounded bg-muted px-1">.env</code> file and restart the server to change these values.
          </p>
        </CardContent>
      </Card>
      {groups.map((group) => (
        <Card key={group.label}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{group.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(group.entries).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">{camelToTitle(key)}</span>
                  <span className="max-w-[50%] truncate text-right font-mono text-xs">
                    {value ?? <span className="text-muted-foreground/50">not set</span>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mailer section                                                     */
/* ------------------------------------------------------------------ */

function MailerSection({
  config,
  onChange,
  onSave,
  saving,
}: {
  config: MailerConfig | null
  onChange: (c: MailerConfig) => void
  onSave: () => void
  saving: boolean
}) {
  if (!config) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No mailer configuration found.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Mailer Worker Settings</CardTitle>
          <CardDescription className="text-xs">Controls how the mail delivery system operates.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Workers"
            value={config.workers}
            onChange={(v) => onChange({ ...config, workers: v })}
            min={1}
            max={16}
          />
          <NumberField
            label="Delay between sends (ms)"
            value={config.delay_ms}
            onChange={(v) => onChange({ ...config, delay_ms: v })}
            min={0}
            max={60000}
          />
          <NumberField
            label="Max messages per account"
            value={config.max_msgs_per_account}
            onChange={(v) => onChange({ ...config, max_msgs_per_account: v })}
            min={1}
            max={10000}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} size="lg">
          {saving ? "Saving..." : "Save Mailer Config"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Provider Keys section                                              */
/* ------------------------------------------------------------------ */

type ProviderKeysMap = Record<string, string>

const PROVIDER_KEY_FIELDS: {
  group: string
  fields: { key: string; label: string; placeholder: string }[]
}[] = [
  {
    group: "Vultr",
    fields: [
      { key: "vultr", label: "API Key", placeholder: "Vultr API key from my.vultr.com/settings/#settingsapi" },
    ],
  },
  {
    group: "Hetzner",
    fields: [
      { key: "hetzner", label: "API Token", placeholder: "Hetzner Cloud API token" },
    ],
  },
  {
    group: "DigitalOcean",
    fields: [
      { key: "digitalocean", label: "API Token", placeholder: "DigitalOcean personal access token" },
    ],
  },
  {
    group: "AWS Lightsail",
    fields: [
      { key: "aws_access_key_id", label: "Access Key ID", placeholder: "AKIA..." },
      { key: "aws_secret_access_key", label: "Secret Access Key", placeholder: "AWS secret key" },
      { key: "aws_region", label: "Default Region", placeholder: "us-east-1" },
    ],
  },
  {
    group: "Azure",
    fields: [
      { key: "azure_subscription_id", label: "Subscription ID", placeholder: "Azure subscription ID" },
      { key: "azure_tenant_id", label: "Tenant ID", placeholder: "Azure AD tenant ID" },
      { key: "azure_client_id", label: "Client ID", placeholder: "Service principal client ID" },
      { key: "azure_client_secret", label: "Client Secret", placeholder: "Service principal secret" },
    ],
  },
]

function ProviderKeysSection() {
  const [keys, setKeys] = useState<ProviderKeysMap>({})
  const [masked, setMasked] = useState<ProviderKeysMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edited, setEdited] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/config/provider-keys", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data) return
        setMasked(data.keys ?? {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [])

  const handleChange = (key: string, value: string) => {
    setKeys((prev) => ({ ...prev, [key]: value }))
    setEdited((prev) => new Set(prev).add(key))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Only send keys the user actually typed into
      const payload: Record<string, string> = {}
      for (const k of edited) {
        payload[k] = keys[k] ?? ""
      }
      const res = await fetch("/api/admin/config/provider-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMasked(data.keys ?? {})
      setKeys({})
      setEdited(new Set())
      toast.success("Provider keys saved")
    } catch (err) {
      toast.error("Save failed", { description: err instanceof Error ? err.message : "Unknown" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading provider keys...</p>
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-500/30">
        <CardContent className="py-3">
          <p className="text-xs text-blue-600 dark:text-blue-400">
            API keys set here take priority over <code className="rounded bg-muted px-1">.env</code> values. Keys are stored locally in <code className="rounded bg-muted px-1">config/provider-keys.json</code> (gitignored). Leave a field empty to clear it.
          </p>
        </CardContent>
      </Card>

      {PROVIDER_KEY_FIELDS.map((group) => (
        <Card key={group.group}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{group.group}</CardTitle>
            <div className="text-muted-foreground text-xs">
              {group.fields.some((f) => masked[f.key]) ? (
                <Badge variant="default" className="text-[10px]">Configured</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Not set</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {group.fields.map((field) => {
              const isEdited = edited.has(field.key)
              const displayValue = isEdited ? (keys[field.key] ?? "") : ""
              const maskedValue = masked[field.key]
              return (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                  <input
                    type={field.key.includes("secret") || field.key === "vultr" || field.key === "hetzner" || field.key === "digitalocean" || field.key === "aws_secret_access_key" || field.key === "azure_client_secret" ? "password" : "text"}
                    value={displayValue}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={maskedValue ? `Current: ${maskedValue}` : field.placeholder}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                  />
                  {maskedValue && !isEdited && (
                    <p className="text-[10px] text-muted-foreground">Stored: {maskedValue}</p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || edited.size === 0} size="lg">
          {saving ? "Saving..." : "Save Provider Keys"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reusable field components                                          */
/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === "password"
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-1">
        <input
          type={isPassword && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="shrink-0 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary" />
      {label}
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={min}
        max={max}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Danger Mode section                                                */
/* ------------------------------------------------------------------ */

function DangerModeSection({
  dangerMode,
  onChange,
}: {
  dangerMode: { disableAIGuardRails: boolean; bypassDeploymentApprovals: boolean }
  onChange: (mode: { disableAIGuardRails: boolean; bypassDeploymentApprovals: boolean }) => void
}) {
  const handleToggle = async (key: keyof typeof dangerMode, value: boolean) => {
    const newMode = { ...dangerMode, [key]: value }
    onChange(newMode)

    try {
      const res = await fetch("/api/admin/config/danger-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newMode),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Danger mode settings updated")
    } catch (err) {
      toast.error("Failed to update danger mode", { description: err instanceof Error ? err.message : "Unknown" })
      // Revert on error
      onChange(dangerMode)
    }
  }

  const anyEnabled = dangerMode.disableAIGuardRails || dangerMode.bypassDeploymentApprovals

  return (
    <Card className={cn("border-2", anyEnabled ? "border-red-500/50 bg-red-50/5 dark:bg-red-950/10" : "")}>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2", anyEnabled ? "text-red-600 dark:text-red-400" : "")}>
          <span>⚠️ Danger Mode</span>
          {anyEnabled && <Badge variant="destructive">ACTIVE</Badge>}
        </CardTitle>
        <CardDescription>
          {anyEnabled
            ? "Safety checks and approval workflows are currently disabled. Use with caution."
            : "Disable safety checks and bypass approval workflows for development/testing."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {anyEnabled && (
          <div className="rounded-lg bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4">
            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
              ⚠️ Warning: Danger mode is active
            </p>
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
              <li>AI guardrails are disabled - AI may generate harmful or inappropriate content</li>
              <li>Deployment approvals are bypassed - deployments will execute without review</li>
              <li>These settings should only be used in development/test environments</li>
              <li>Disable danger mode before returning to production use</li>
            </ul>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
            <div className="space-y-1">
              <div className="font-medium">Disable AI Guard Rails</div>
              <div className="text-sm text-muted-foreground">
                Remove AI safety filters and content restrictions. AI may generate unrestricted content.
              </div>
            </div>
            <button
              onClick={() => handleToggle("disableAIGuardRails", !dangerMode.disableAIGuardRails)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                dangerMode.disableAIGuardRails ? "bg-red-600" : "bg-input"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  dangerMode.disableAIGuardRails ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
            <div className="space-y-1">
              <div className="font-medium">Bypass Deployment Approvals</div>
              <div className="text-sm text-muted-foreground">
                Skip approval workflows for node deployments. Deployments will execute immediately.
              </div>
            </div>
            <button
              onClick={() => handleToggle("bypassDeploymentApprovals", !dangerMode.bypassDeploymentApprovals)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                dangerMode.bypassDeploymentApprovals ? "bg-red-600" : "bg-input"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  dangerMode.bypassDeploymentApprovals ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            These settings are stored locally in your browser session. They will reset when you clear browser data or restart the server.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function camelToTitle(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}
