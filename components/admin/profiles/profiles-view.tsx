"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProfileItem = {
  id: string
  name: string
  type: string
  description: string
  nodeIds: string[]
  config: Record<string, unknown>
  tags: string[]
  createdAt: number
}

type NodeItem = {
  id: string
  name: string
  hostname: string
  status: string
}

type ModalState =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; profile: ProfileItem }
  | { kind: "delete"; profile: ProfileItem }
  | { kind: "apply"; profile: ProfileItem }

const TYPE_LABELS: Record<string, string> = {
  basic_tls_proxy: "Basic TLS Proxy",
  socks5_relay: "SOCKS5 Relay",
  high_throughput: "High-Throughput",
  tun_overlay: "TUN Overlay",
  custom: "Custom",
}

const TYPE_PRESETS: Record<string, Record<string, unknown>> = {
  basic_tls_proxy: { port: 443, obfsType: "none", tlsMode: "acme", masqueradeUrl: "https://www.google.com" },
  socks5_relay: { port: 443, obfsType: "salamander", tlsMode: "acme", socksListen: ":1080" },
  high_throughput: { port: 443, obfsType: "none", bandwidthUp: "1 gbps", bandwidthDown: "1 gbps", tlsMode: "acme" },
  tun_overlay: { port: 443, obfsType: "salamander", tlsMode: "acme", tunEnabled: true, tunMtu: 1400 },
  custom: { port: 443 },
}

function typeTone(type: string): string {
  switch (type) {
    case "basic_tls_proxy": return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
    case "socks5_relay": return "bg-purple-500/15 text-purple-700 dark:text-purple-300"
    case "high_throughput": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "tun_overlay": return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    default: return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
  }
}

/* ------------------------------------------------------------------ */
/*  Main view                                                          */
/* ------------------------------------------------------------------ */

export function ProfilesView() {
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>({ kind: "closed" })
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    try {
      const [pRes, nRes] = await Promise.all([
        fetch("/api/admin/profiles", { cache: "no-store" }),
        fetch("/api/admin/nodes", { cache: "no-store" }),
      ])
      if (pRes.ok) {
        const d = await pRes.json()
        setProfiles((Array.isArray(d) ? d : d.profiles ?? []) as ProfileItem[])
      }
      if (nRes.ok) {
        const d = await nRes.json()
        setNodes(
          (Array.isArray(d) ? d : d.nodes ?? []).map((n: Record<string, unknown>) => ({
            id: n.id as string,
            name: n.name as string,
            hostname: n.hostname as string,
            status: n.status as string,
          })),
        )
      }
    } catch (err) {
      toast.error("Failed to load data", { description: err instanceof Error ? err.message : "unknown" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const doLoad = async () => { await load(); if (!active) return }
    doLoad()
    return () => { active = false }
  }, [load])

  const filtered = useMemo(() => {
    if (!search) return profiles
    const q = search.toLowerCase()
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (TYPE_LABELS[p.type] ?? p.type).toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [profiles, search])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Profiles</h1>
          <p className="text-sm text-zinc-500">Reusable configuration templates for node groups</p>
        </div>
        <Button onClick={() => setModal({ kind: "new" })}>+ New Profile</Button>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search profiles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500">
            No profiles yet. Click &quot;+ New Profile&quot; to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <span className={cn("mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium", typeTone(p.type))}>
                      {TYPE_LABELS[p.type] ?? p.type}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400">{p.nodeIds.length} node{p.nodeIds.length !== 1 ? "s" : ""}</span>
                </div>
                {p.description && <p className="text-sm text-zinc-500 line-clamp-2">{p.description}</p>}
                {p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setModal({ kind: "apply", profile: p })}>
                    Apply to Nodes
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal({ kind: "edit", profile: p })}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal({ kind: "delete", profile: p })}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      {modal.kind === "new" && (
        <NewProfileModal
          onClose={() => setModal({ kind: "closed" })}
          onCreated={() => { setModal({ kind: "closed" }); load() }}
        />
      )}
      {modal.kind === "edit" && (
        <EditProfileModal
          profile={modal.profile}
          onClose={() => setModal({ kind: "closed" })}
          onSaved={() => { setModal({ kind: "closed" }); load() }}
        />
      )}
      {modal.kind === "delete" && (
        <DeleteProfileModal
          profile={modal.profile}
          onClose={() => setModal({ kind: "closed" })}
          onDeleted={() => { setModal({ kind: "closed" }); load() }}
        />
      )}
      {modal.kind === "apply" && (
        <ApplyProfileModal
          profile={modal.profile}
          nodes={nodes}
          onClose={() => setModal({ kind: "closed" })}
          onApplied={() => { setModal({ kind: "closed" }); load() }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  New Profile Modal                                                  */
/* ------------------------------------------------------------------ */

function NewProfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [type, setType] = useState("basic_tls_proxy")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState("")
  const [saving, setSaving] = useState(false)

  const preset = TYPE_PRESETS[type] ?? {}

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          description: description.trim(),
          config: preset,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success("Profile created")
      onCreated()
    } catch (err) {
      toast.error("Failed to create profile", { description: err instanceof Error ? err.message : "unknown" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <h2 className="text-lg font-semibold mb-4">New Profile</h2>
      <div className="space-y-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="e.g. US East Proxy" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className="input-field">
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={2} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" placeholder="prod, us-east" />
        </Field>
        <div className="rounded bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
          <p className="font-medium mb-1">Preset config:</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(preset, null, 2)}</pre>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Creating..." : "Create Profile"}</Button>
      </div>
    </ModalBackdrop>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit Profile Modal                                                 */
/* ------------------------------------------------------------------ */

function EditProfileModal({ profile, onClose, onSaved }: { profile: ProfileItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile.name)
  const [description, setDescription] = useState(profile.description)
  const [tags, setTags] = useState(profile.tags.join(", "))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success("Profile updated")
      onSaved()
    } catch (err) {
      toast.error("Failed to update", { description: err instanceof Error ? err.message : "unknown" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <h2 className="text-lg font-semibold mb-4">Edit Profile</h2>
      <div className="space-y-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={2} />
        </Field>
        <Field label="Tags">
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </div>
    </ModalBackdrop>
  )
}

/* ------------------------------------------------------------------ */
/*  Delete Profile Modal                                               */
/* ------------------------------------------------------------------ */

function DeleteProfileModal({ profile, onClose, onDeleted }: { profile: ProfileItem; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)

  const doDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success("Profile deleted")
      onDeleted()
    } catch (err) {
      toast.error("Delete failed", { description: err instanceof Error ? err.message : "unknown" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <h2 className="text-lg font-semibold mb-2">Delete Profile</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Are you sure you want to delete <strong>{profile.name}</strong>? This will not affect any nodes already using this profile.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={doDelete} disabled={deleting} className="bg-red-600 text-white hover:bg-red-700">
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </ModalBackdrop>
  )
}

/* ------------------------------------------------------------------ */
/*  Apply Profile Modal                                                */
/* ------------------------------------------------------------------ */

function ApplyProfileModal({
  profile,
  nodes,
  onClose,
  onApplied,
}: {
  profile: ProfileItem
  nodes: NodeItem[]
  onClose: () => void
  onApplied: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(profile.nodeIds))
  const [applying, setApplying] = useState(false)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const apply = async () => {
    if (selected.size === 0) { toast.error("Select at least one node"); return }
    setApplying(true)
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeIds: [...selected] }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      toast.success(`Profile applied to ${data.applied} node(s)`)
      onApplied()
    } catch (err) {
      toast.error("Apply failed", { description: err instanceof Error ? err.message : "unknown" })
    } finally {
      setApplying(false)
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <h2 className="text-lg font-semibold mb-2">Apply Profile: {profile.name}</h2>
      <p className="text-sm text-zinc-500 mb-4">Select nodes to apply this profile&apos;s tags and configuration to.</p>
      <div className="max-h-64 overflow-y-auto border rounded dark:border-zinc-700">
        {nodes.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No nodes available</p>
        ) : (
          nodes.map((n) => (
            <label key={n.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(n.id)}
                onChange={() => toggle(n.id)}
                className="rounded"
              />
              <span className="text-sm font-medium">{n.name}</span>
              <span className="text-xs text-zinc-400">{n.hostname}</span>
              <span className={cn(
                "ml-auto rounded px-1.5 py-0.5 text-xs",
                n.status === "running" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-500/15 text-zinc-500",
              )}>
                {n.status}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={apply} disabled={applying || selected.size === 0}>
          {applying ? "Applying..." : `Apply to ${selected.size} Node(s)`}
        </Button>
      </div>
    </ModalBackdrop>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared UI                                                          */
/* ------------------------------------------------------------------ */

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
