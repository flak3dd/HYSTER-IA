"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DeployModal } from "@/components/admin/nodes/deploy-modal"
import {
  type NodeItem,
  type ProfileItem,
  ModalOverlay,
  NewNodeModal,
  EditNodeModal,
  RotateAuthModal,
  DeleteNodeModal,
  ApplyProfileToNodesModal,
} from "@/components/admin/nodes/node-modals"

type ModalState =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; node: NodeItem }
  | { kind: "rotate"; node: NodeItem }
  | { kind: "delete"; node: NodeItem }
  | { kind: "deploy" }
  | { kind: "apply-profile" }

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function timeAgo(ts: number | null): string {
  if (!ts) return "never"
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function stateTone(state: string): string {
  switch (state) {
    case "running":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "starting":
    case "stopping":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
    case "errored":
      return "bg-red-500/15 text-red-700 dark:text-red-300"
    default:
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
  }
}

/* ------------------------------------------------------------------ */
/*  Main view                                                         */
/* ------------------------------------------------------------------ */

export function NodesView() {
  const router = useRouter()
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>({ kind: "closed" })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // filters
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState<string>("")

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/nodes", { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      const items: NodeItem[] = (Array.isArray(data) ? data : data.nodes ?? []).map(
        (n: Record<string, unknown>) => ({
          id: n.id as string,
          name: n.name as string,
          hostname: n.hostname as string,
          region: (n.region as string) ?? null,
          listenAddr: (n.listenAddr as string) ?? ":443",
          status: n.status as string,
          tags: Array.isArray(n.tags) ? (n.tags as string[]) : [],
          provider: (n.provider as string) ?? null,
          lastHeartbeatAt: (n.lastHeartbeatAt as number) ?? null,
        }),
      )
      setNodes(items)

      // also load profiles
      const pRes = await apiFetch("/api/admin/profiles", { cache: "no-store" }).catch(() => null)
      if (pRes?.ok) {
        const pd = await pRes.json()
        setProfiles((Array.isArray(pd) ? pd : pd.profiles ?? []) as ProfileItem[])
      }
    } catch (err) {
      toast.error("Failed to load nodes", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const doLoad = async () => {
      await load()
      if (!active) return
    }
    doLoad()
    return () => { active = false }
  }, [load])

  // derive unique tags
  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const n of nodes) for (const t of n.tags) s.add(t)
    return [...s].sort()
  }, [nodes])

  // filtered list
  const filtered = useMemo(() => {
    let list = nodes
    if (statusFilter !== "all") list = list.filter((n) => n.status === statusFilter)
    if (tagFilter) list = list.filter((n) => n.tags.includes(tagFilter))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.hostname.toLowerCase().includes(q) ||
          (n.region ?? "").toLowerCase().includes(q) ||
          (n.provider ?? "").toLowerCase().includes(q),
      )
    }
    return list
  }, [nodes, statusFilter, tagFilter, search])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const generateConfigForSelected = () => {
    if (selected.size === 0) {
      toast.error("Select at least one node")
      return
    }
    const ids = [...selected].join(",")
    router.push(`/admin/configs?nodes=${ids}`)
  }

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading nodes…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-xl">Nodes</h1>
          <p className="text-sm text-muted-foreground">
            Manage your Hysteria2 node inventory
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={generateConfigForSelected}>
                Generate Config ({selected.size})
              </Button>
              {profiles.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setModal({ kind: "apply-profile" })}>
                  Apply Profile ({selected.size})
                </Button>
              )}
            </>
          ) : null}
          <Button size="sm" onClick={() => setModal({ kind: "deploy" })}>
            + Deploy New Node
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal({ kind: "new" })}>
            + Manual Add
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search name, host, region…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
          <option value="errored">Errored</option>
          <option value="starting">Starting</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3 font-medium w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={() => {
                        if (selected.size === filtered.length) setSelected(new Set())
                        else setSelected(new Set(filtered.map((n) => n.id)))
                      }}
                      className="accent-primary"
                    />
                  </th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Address</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Tags</th>
                  <th className="p-3 font-medium">Last Heartbeat</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No nodes match filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((n) => (
                    <tr
                      key={n.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        selected.has(n.id) && "bg-muted/50",
                      )}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(n.id)}
                          onChange={() => toggleSelect(n.id)}
                          className="accent-primary"
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{n.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {n.region ?? ""}{n.provider ? ` · ${n.provider}` : ""}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {n.hostname}{n.listenAddr !== ":443" ? n.listenAddr : ":443"}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                            stateTone(n.status),
                          )}
                        >
                          {n.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {n.tags.length > 0
                            ? n.tags.map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                  {t}
                                </span>
                              ))
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {timeAgo(n.lastHeartbeatAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              router.push(`/admin/configs?nodes=${n.id}`)
                            }
                          >
                            Config
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setModal({ kind: "edit", node: n })}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setModal({ kind: "rotate", node: n })}
                          >
                            Rotate Auth
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => setModal({ kind: "delete", node: n })}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {modal.kind !== "closed" ? (
        <ModalOverlay onClose={() => setModal({ kind: "closed" })}>
          {modal.kind === "new" ? (
            <NewNodeModal
              onClose={() => setModal({ kind: "closed" })}
              onCreated={() => {
                setModal({ kind: "closed" })
                load()
              }}
            />
          ) : modal.kind === "edit" ? (
            <EditNodeModal
              node={modal.node}
              onClose={() => setModal({ kind: "closed" })}
              onSaved={() => {
                setModal({ kind: "closed" })
                load()
              }}
            />
          ) : modal.kind === "rotate" ? (
            <RotateAuthModal
              node={modal.node}
              onClose={() => setModal({ kind: "closed" })}
              onRotated={() => {
                setModal({ kind: "closed" })
                load()
              }}
            />
          ) : modal.kind === "delete" ? (
            <DeleteNodeModal
              node={modal.node}
              onClose={() => setModal({ kind: "closed" })}
              onDeleted={() => {
                setModal({ kind: "closed" })
                load()
              }}
            />
          ) : null}
        </ModalOverlay>
      ) : null}

      {modal.kind === "deploy" && (
        <DeployModal
          onClose={() => setModal({ kind: "closed" })}
          onDeployed={() => {
            setModal({ kind: "closed" })
            load()
          }}
        />
      )}

      {modal.kind === "apply-profile" && (
        <ApplyProfileToNodesModal
          profiles={profiles}
          selectedNodeIds={[...selected]}
          onClose={() => setModal({ kind: "closed" })}
          onApplied={() => {
            setModal({ kind: "closed" })
            load()
          }}
        />
      )}
    </div>
  )
}
