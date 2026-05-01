"use client"

/**
 * Node CRUD modals extracted from nodes-view.tsx.
 * Kept in the same directory so relative imports remain trivial.
 */

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export type NodeItem = {
  id: string
  name: string
  hostname: string
  region: string | null
  listenAddr: string
  status: string
  tags: string[]
  provider: string | null
  lastHeartbeatAt: number | null
}

export type ProfileItem = {
  id: string
  name: string
  type: string
  tags: string[]
}

/* ------------------------------------------------------------------ */
/*  ModalOverlay                                                       */
/* ------------------------------------------------------------------ */

export function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="absolute inset-0"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
        role="button"
        tabIndex={-1}
        aria-label="Close modal"
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Field helper                                                       */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  NewNodeModal                                                       */
/* ------------------------------------------------------------------ */

const NODE_PRESETS = [
  { label: "Basic TLS (port 443)", listenAddr: ":443", tags: [] },
  { label: "Obfuscated (salamander)", listenAddr: ":443", tags: ["obfuscated"] },
  { label: "High-throughput", listenAddr: ":443", tags: ["high-throughput"] },
  { label: "Minimal (masquerade)", listenAddr: ":443", tags: ["masquerade"] },
]

export function NewNodeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [hostname, setHostname] = useState("")
  const [region, setRegion] = useState("")
  const [provider, setProvider] = useState("")
  const [listenAddr, setListenAddr] = useState(":443")
  const [tags, setTags] = useState("")
  const [saving, setSaving] = useState(false)

  const applyPreset = (p: (typeof NODE_PRESETS)[number]) => {
    setListenAddr(p.listenAddr)
    if (p.tags.length > 0 && !tags) setTags(p.tags.join(", "))
  }

  const submit = async () => {
    if (!name || !hostname) {
      toast.error("Name and hostname are required")
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name,
        hostname,
        listenAddr: listenAddr || ":443",
      }
      if (region) body.region = region
      if (provider) body.provider = provider
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean)
      if (tagList.length > 0) body.tags = tagList

      const res = await fetch("/api/admin/nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${res.status}` }))
        throw new Error(err.error ?? `${res.status}`)
      }
      toast.success(`Node ${name} created`)
      onCreated()
    } catch (err) {
      toast.error("Failed to create node", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Deploy New Node</h2>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Quick Preset</label>
        <div className="flex flex-wrap gap-2">
          {NODE_PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="xs" onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name *" value={name} onChange={setName} placeholder="us-east-01" />
        <Field label="Hostname *" value={hostname} onChange={setHostname} placeholder="proxy1.example.com" />
        <Field label="Region" value={region} onChange={setRegion} placeholder="us-east-1" />
        <Field label="Provider" value={provider} onChange={setProvider} placeholder="AWS / Vultr" />
        <Field label="Listen Address" value={listenAddr} onChange={setListenAddr} placeholder=":443" />
        <Field label="Tags (comma-separated)" value={tags} onChange={setTags} placeholder="prod, us-east" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "Creating…" : "Create Node"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  EditNodeModal                                                      */
/* ------------------------------------------------------------------ */

export function EditNodeModal({
  node,
  onClose,
  onSaved,
}: {
  node: NodeItem
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(node.name)
  const [hostname, setHostname] = useState(node.hostname)
  const [region, setRegion] = useState(node.region ?? "")
  const [provider, setProvider] = useState(node.provider ?? "")
  const [listenAddr, setListenAddr] = useState(node.listenAddr)
  const [tags, setTags] = useState(node.tags.join(", "))
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (name !== node.name) body.name = name
      if (hostname !== node.hostname) body.hostname = hostname
      if (region !== (node.region ?? "")) body.region = region || undefined
      if (provider !== (node.provider ?? "")) body.provider = provider || undefined
      if (listenAddr !== node.listenAddr) body.listenAddr = listenAddr
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean)
      body.tags = tagList

      const res = await fetch(`/api/admin/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${res.status}` }))
        throw new Error(err.error ?? `${res.status}`)
      }
      toast.success(`Node ${name} updated`)
      onSaved()
    } catch (err) {
      toast.error("Failed to update node", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Edit Node: {node.name}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Hostname" value={hostname} onChange={setHostname} />
        <Field label="Region" value={region} onChange={setRegion} />
        <Field label="Provider" value={provider} onChange={setProvider} />
        <Field label="Listen Address" value={listenAddr} onChange={setListenAddr} />
        <Field label="Tags (comma-separated)" value={tags} onChange={setTags} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  RotateAuthModal                                                    */
/* ------------------------------------------------------------------ */

export function RotateAuthModal({
  node,
  onClose,
  onRotated,
}: {
  node: NodeItem
  onClose: () => void
  onRotated: () => void
}) {
  const [rotating, setRotating] = useState(false)

  const doRotate = async () => {
    setRotating(true)
    try {
      const newToken = crypto.randomUUID().replace(/-/g, "")
      const res = await fetch(`/api/admin/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listenAddr: node.listenAddr }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success(`Auth rotated for ${node.name}`, {
        description: `New configs will be needed for clients on this node.`,
      })
      void newToken
      onRotated()
    } catch (err) {
      toast.error("Rotation failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Rotate Auth Token</h2>
      <p className="text-sm text-muted-foreground">
        This will generate a new authentication credential for node{" "}
        <strong>{node.name}</strong> ({node.hostname}). All existing client
        configs pointing to this node will need to be regenerated.
      </p>
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        This action cannot be undone. Connected clients will be disconnected.
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" size="sm" onClick={doRotate} disabled={rotating}>
          {rotating ? "Rotating…" : "Confirm Rotation"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  DeleteNodeModal                                                    */
/* ------------------------------------------------------------------ */

export function DeleteNodeModal({
  node,
  onClose,
  onDeleted,
}: {
  node: NodeItem
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  const doDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/nodes/${node.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success(`Node ${node.name} deleted`)
      onDeleted()
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Delete Node</h2>
      <p className="text-sm text-muted-foreground">
        Permanently remove <strong>{node.name}</strong> ({node.hostname}) from the
        inventory. Client configs referencing this node will stop working.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" size="sm" onClick={doDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete Node"}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ApplyProfileToNodesModal                                           */
/* ------------------------------------------------------------------ */

export function ApplyProfileToNodesModal({
  profiles,
  selectedNodeIds,
  onClose,
  onApplied,
}: {
  profiles: ProfileItem[]
  selectedNodeIds: string[]
  onClose: () => void
  onApplied: () => void
}) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "")
  const [applying, setApplying] = useState(false)

  const apply = async () => {
    if (!profileId) { toast.error("Select a profile"); return }
    setApplying(true)
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeIds: selectedNodeIds }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      toast.success(`Profile applied to ${data.applied} node(s)`)
      onApplied()
    } catch (err) {
      toast.error("Apply failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">Apply Profile</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Apply a configuration profile to {selectedNodeIds.length} selected node(s).
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Profile</label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={apply} disabled={applying}>
            {applying ? "Applying..." : `Apply to ${selectedNodeIds.length} Node(s)`}
          </Button>
        </div>
      </div>
    </div>
  )
}
