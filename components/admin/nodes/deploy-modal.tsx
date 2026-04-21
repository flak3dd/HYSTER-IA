"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProviderPreset = {
  id: string
  label: string
  regions: { id: string; label: string }[]
  sizes: { id: string; label: string; cpu: number; ram: string; disk: string; price: string }[]
}

type DeployStep = {
  status: string
  message: string
  timestamp: number
  error: string | null
}

type DeployPhase = "config" | "deploying" | "done" | "failed"

/* ------------------------------------------------------------------ */
/*  Deploy Modal                                                       */
/* ------------------------------------------------------------------ */

export function DeployModal({ onClose, onDeployed }: { onClose: () => void; onDeployed: () => void }) {
  const [phase, setPhase] = useState<DeployPhase>("config")
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [loadingPresets, setLoadingPresets] = useState(true)

  // form state
  const [provider, setProvider] = useState("hetzner")
  const [region, setRegion] = useState("")
  const [size, setSize] = useState("")
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [port, setPort] = useState("443")
  const [obfsPassword, setObfsPassword] = useState("")
  const [email, setEmail] = useState("")
  const [tags, setTags] = useState("")
  const [bandwidthUp, setBandwidthUp] = useState("")
  const [bandwidthDown, setBandwidthDown] = useState("")

  // deploy state
  const [steps, setSteps] = useState<DeployStep[]>([])
  const [deployId, setDeployId] = useState<string | null>(null)

  const loadPresets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy/presets", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setPresets(data.presets ?? [])
        if (data.presets?.length > 0) {
          setProvider(data.presets[0].id)
          if (data.presets[0].regions?.length > 0) setRegion(data.presets[0].regions[0].id)
          if (data.presets[0].sizes?.length > 0) setSize(data.presets[0].sizes[0].id)
        }
      }
    } catch {
      // presets unavailable
    } finally {
      setLoadingPresets(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const doLoad = async () => { await loadPresets(); if (!active) return }
    doLoad()
    return () => { active = false }
  }, [loadPresets])

  const currentPreset = presets.find((p) => p.id === provider)

  // When provider changes, reset region/size to first available
  const handleProviderChange = useCallback((newProvider: string) => {
    setProvider(newProvider)
    const preset = presets.find((p) => p.id === newProvider)
    if (preset) {
      if (preset.regions.length > 0) setRegion(preset.regions[0].id)
      if (preset.sizes.length > 0) setSize(preset.sizes[0].id)
    }
  }, [presets])

  const startDeploy = async () => {
    if (!name.trim()) { toast.error("Node name is required"); return }

    setPhase("deploying")
    setSteps([])

    try {
      const panelUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
      const res = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: provider.replace(/ \(no key\)/, ""),
          region,
          size,
          name: name.trim(),
          domain: domain.trim() || undefined,
          port: parseInt(port) || 443,
          obfsPassword: obfsPassword.trim() || undefined,
          email: email.trim() || undefined,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          panelUrl,
          bandwidthUp: bandwidthUp.trim() || undefined,
          bandwidthDown: bandwidthDown.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? `${res.status}`)
      }

      const data = await res.json()
      const id = data.deployment?.id
      if (!id) throw new Error("No deployment ID returned")
      setDeployId(id)

      // Subscribe to SSE stream
      const sse = new EventSource(`/api/admin/deploy/${id}/stream`)
      sse.onmessage = (event) => {
        try {
          const step = JSON.parse(event.data)
          if (step.done) {
            sse.close()
            return
          }
          setSteps((prev) => [...prev, step])
          if (step.status === "completed") {
            setPhase("done")
            toast.success("Node deployed successfully!")
            sse.close()
          } else if (step.status === "failed") {
            setPhase("failed")
            toast.error("Deployment failed", { description: step.error ?? step.message })
            sse.close()
          }
        } catch { /* ignore parse errors */ }
      }
      sse.onerror = () => {
        sse.close()
        if (phase === "deploying") setPhase("failed")
      }
    } catch (err) {
      setPhase("failed")
      toast.error("Deploy failed", { description: err instanceof Error ? err.message : "unknown" })
    }
  }

  const destroy = async () => {
    if (!deployId) return
    try {
      await fetch(`/api/admin/deploy/${deployId}/destroy`, { method: "POST" })
      toast.success("VPS destroyed")
      onClose()
    } catch (err) {
      toast.error("Destroy failed", { description: err instanceof Error ? err.message : "unknown" })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "config" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Deploy New Node</h2>
            {loadingPresets ? (
              <p className="text-sm text-zinc-500">Loading provider presets...</p>
            ) : (
              <div className="space-y-3">
                <Field label="Provider">
                  <select value={provider} onChange={(e) => handleProviderChange(e.target.value)} className="input-field">
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </Field>

                {currentPreset && (
                  <>
                    <Field label="Region">
                      <select value={region} onChange={(e) => setRegion(e.target.value)} className="input-field">
                        {currentPreset.regions.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Size">
                      <select value={size} onChange={(e) => setSize(e.target.value)} className="input-field">
                        {currentPreset.sizes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} — {s.cpu} vCPU, {s.ram}, {s.disk} ({s.price})
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}

                <Field label="Node Name *">
                  <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="us-east-proxy-01" />
                </Field>

                <Field label="Domain (optional, for Let's Encrypt)">
                  <input value={domain} onChange={(e) => setDomain(e.target.value)} className="input-field" placeholder="proxy.example.com" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Port">
                    <input value={port} onChange={(e) => setPort(e.target.value)} className="input-field" type="number" />
                  </Field>
                  <Field label="Email (for ACME)">
                    <input value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="admin@example.com" />
                  </Field>
                </div>

                <Field label="Obfuscation Password (optional, enables salamander)">
                  <input value={obfsPassword} onChange={(e) => setObfsPassword(e.target.value)} className="input-field" placeholder="Leave empty to disable" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bandwidth Up">
                    <input value={bandwidthUp} onChange={(e) => setBandwidthUp(e.target.value)} className="input-field" placeholder="e.g. 100 Mbps" />
                  </Field>
                  <Field label="Bandwidth Down">
                    <input value={bandwidthDown} onChange={(e) => setBandwidthDown(e.target.value)} className="input-field" placeholder="e.g. 500 Mbps" />
                  </Field>
                </div>

                <Field label="Tags (comma-separated)">
                  <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" placeholder="prod, us-east" />
                </Field>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={startDeploy} disabled={loadingPresets}>Deploy Node</Button>
            </div>
          </>
        )}

        {(phase === "deploying" || phase === "done" || phase === "failed") && (
          <>
            <h2 className="text-lg font-semibold mb-4">
              {phase === "deploying" && "Deploying..."}
              {phase === "done" && "Deployment Complete"}
              {phase === "failed" && "Deployment Failed"}
            </h2>

            <div className="max-h-80 overflow-y-auto rounded border bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950">
              {steps.map((step, i) => (
                <div key={i} className={cn("py-1", step.error ? "text-red-600" : "text-zinc-600 dark:text-zinc-400")}>
                  <span className="text-zinc-400">[{new Date(step.timestamp).toLocaleTimeString()}]</span>{" "}
                  <span className={cn(
                    "font-medium",
                    step.status === "completed" ? "text-emerald-600" :
                    step.status === "failed" ? "text-red-600" : "text-blue-600"
                  )}>
                    [{step.status}]
                  </span>{" "}
                  {step.message}
                  {step.error && <div className="mt-0.5 text-red-500 pl-4">{step.error}</div>}
                </div>
              ))}
              {phase === "deploying" && (
                <div className="py-1 text-blue-500 animate-pulse">Waiting for next step...</div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              {phase === "failed" && deployId && (
                <Button variant="outline" onClick={destroy} className="text-red-600">
                  Destroy VPS
                </Button>
              )}
              {phase === "done" && (
                <Button onClick={() => { onDeployed(); onClose() }}>Done</Button>
              )}
              {phase === "failed" && (
                <Button variant="outline" onClick={onClose}>Close</Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
