"use client"
import { apiFetch } from "@/lib/api/fetch"

/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MigratorConfig = {
  workers: number
  delay_ms: number
  max_msgs_per_account: number
}

type LogEntry = {
  type: "log" | "stdout" | "error" | "exit"
  text?: string
  code?: number
}

type HostGroup = {
  provider: string
  host: string
  emails: string[]
}

const DEFAULT_CONFIG: MigratorConfig = {
  workers: 3,
  delay_ms: 1500,
  max_msgs_per_account: 500,
}

/** Map common email domains to a friendly provider name */
const KNOWN_PROVIDERS: Record<string, string> = {
  "gmail.com": "Google",
  "googlemail.com": "Google",
  "outlook.com": "Microsoft",
  "hotmail.com": "Microsoft",
  "live.com": "Microsoft",
  "msn.com": "Microsoft",
  "yahoo.com": "Yahoo",
  "yahoo.co.uk": "Yahoo",
  "ymail.com": "Yahoo",
  "aol.com": "AOL",
  "icloud.com": "Apple iCloud",
  "me.com": "Apple iCloud",
  "mac.com": "Apple iCloud",
  "protonmail.com": "ProtonMail",
  "proton.me": "ProtonMail",
  "zoho.com": "Zoho",
  "gmx.com": "GMX",
  "gmx.net": "GMX",
  "mail.com": "Mail.com",
  "yandex.com": "Yandex",
  "yandex.ru": "Yandex",
  "tutanota.com": "Tutanota",
  "tuta.io": "Tutanota",
  "fastmail.com": "Fastmail",
}

/** Assign a colour class per provider for visual distinction */
const PROVIDER_COLORS: Record<string, string> = {
  "Google": "bg-red-500/20 text-red-400 border-red-500/30",
  "Microsoft": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Yahoo": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "AOL": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "Apple iCloud": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "ProtonMail": "bg-violet-500/20 text-violet-400 border-violet-500/30",
  "Zoho": "bg-green-500/20 text-green-400 border-green-500/30",
  "Other": "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MigratorView() {
  const [config, setConfig] = useState<MigratorConfig>(DEFAULT_CONFIG)
  const [accounts, setAccounts] = useState("")
  const [folders, setFolders] = useState("INBOX")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [exitCode, setExitCode] = useState<number | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  /* ---- Load config on mount ---- */
  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch("/api/admin/mail/migrator/config", {
          cache: "no-store",
        })
        if (res.ok) {
          const data = await res.json()
          setConfig({ ...DEFAULT_CONFIG, ...data.config })
          setAccounts(data.accounts ?? "")
        }
      } catch (err) {
        toast.error("Failed to load migrator config", {
          description: err instanceof Error ? err.message : "unknown",
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  /* ---- Auto-scroll logs ---- */
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  /* ---- Save config ---- */
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/admin/mail/migrator/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, accounts }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success("Configuration saved")
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSaving(false)
    }
  }, [config, accounts])

  /* ---- Run migrator (SSE stream) ---- */
  const handleRun = useCallback(async () => {
    // Save first, then run
    setSaving(true)
    try {
      const saveRes = await apiFetch("/api/admin/mail/migrator/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, accounts }),
      })
      if (!saveRes.ok) throw new Error(`Save failed: ${saveRes.status}`)
    } catch (err) {
      toast.error("Failed to save before run", {
        description: err instanceof Error ? err.message : "unknown",
      })
      setSaving(false)
      return
    }
    setSaving(false)

    setRunning(true)
    setLogs([])
    setExitCode(null)
    try {
      const res = await apiFetch("/api/admin/mail/migrator/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folders }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error((err as { error?: string }).error ?? `${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No stream")
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""
        for (const part of parts) {
          const line = part.replace(/^data: /, "")
          if (!line) continue
          try {
            const entry = JSON.parse(line) as LogEntry
            if (entry.type === "exit") {
              setExitCode(entry.code ?? -1)
            }
            setLogs((prev) => [...prev, entry])
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      toast.error("Migrator failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
      setLogs((prev) => [
        ...prev,
        { type: "error", text: err instanceof Error ? err.message : "unknown error" },
      ])
    } finally {
      setRunning(false)
    }
  }, [folders, config, accounts])

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading migrator config...</p>
  }

  const accountLines = accounts
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
  const accountCount = accountLines.length
  const validCount = accountLines.filter((l) => l.includes(":")).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-xl">IMAP Attachment Migrator</h1>
        <p className="text-sm text-muted-foreground">
          Download email attachments via IMAP. Uses App Passwords for Gmail /
          Microsoft, or regular passwords for other providers.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ================================================================ */}
        {/*  SETTINGS                                                         */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Settings</CardTitle>
                <CardDescription className="text-xs">
                  Worker concurrency and rate limiting
                </CardDescription>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Workers</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.workers}
                  onChange={(e) => setConfig((p) => ({ ...p, workers: Number(e.target.value) || 1 }))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Delay (ms)</label>
                <input
                  type="number"
                  min={0}
                  value={config.delay_ms}
                  onChange={(e) => setConfig((p) => ({ ...p, delay_ms: Number(e.target.value) || 0 }))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Max Messages</label>
                <input
                  type="number"
                  min={1}
                  value={config.max_msgs_per_account}
                  onChange={(e) => setConfig((p) => ({ ...p, max_msgs_per_account: Number(e.target.value) || 100 }))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2 mt-3">
              <p className="text-xs font-semibold">App Password Setup</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">Gmail:</span> Enable 2-Step Verification, then generate an App Password at myaccount.google.com/apppasswords</p>
                <p><span className="font-medium text-foreground">Microsoft:</span> Go to account.microsoft.com/security and create an app password</p>
                <p><span className="font-medium text-foreground">Yahoo:</span> Go to login.yahoo.com/account/security and generate an app password</p>
                <p><span className="font-medium text-foreground">Other:</span> Use your regular IMAP password</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/*  ACCOUNTS                                                         */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Accounts</CardTitle>
                <CardDescription className="text-xs">
                  {accountCount} line{accountCount !== 1 ? "s" : ""}
                  {validCount < accountCount && (
                    <span className="text-amber-500">
                      {" "}({accountCount - validCount} missing password — will be skipped)
                    </span>
                  )}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                email:password
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <textarea
              value={accounts}
              onChange={(e) => setAccounts(e.target.value)}
              rows={12}
              placeholder={"# One account per line — email:app_password\nalice@gmail.com:abcd efgh ijkl mnop\nbob@outlook.com:myapppassword\nuser@myserver.com:regularpassword"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none"
            />
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/*  RUN CONTROLS                                                     */}
        {/* ================================================================ */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Run Migration</CardTitle>
                <CardDescription className="text-xs">
                  Connects via IMAP TLS, downloads all attachments from selected folders
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Folders
                  </label>
                  <input
                    value={folders}
                    onChange={(e) => setFolders(e.target.value)}
                    placeholder="INBOX,Sent,Archive"
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm w-48"
                  />
                </div>
                <Button
                  onClick={running ? undefined : handleRun}
                  disabled={running || validCount === 0}
                  className="min-w-[120px]"
                >
                  {running ? "Running..." : "Run Migrator"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border bg-black/90 p-3 font-mono text-xs text-green-400 h-72 overflow-y-auto">
              {logs.length === 0 ? (
                <span className="text-muted-foreground">
                  Logs will appear here when you run the migrator...
                </span>
              ) : (
                logs.map((entry, i) => (
                  <div
                    key={i}
                    className={
                      entry.type === "error"
                        ? "text-red-400"
                        : entry.type === "exit"
                          ? entry.code === 0
                            ? "text-emerald-400 font-bold pt-1"
                            : "text-red-400 font-bold pt-1"
                          : entry.type === "stdout"
                            ? "text-blue-300"
                            : "text-green-400"
                    }
                  >
                    {entry.type === "exit"
                      ? `--- Process exited with code ${entry.code} ---`
                      : entry.text}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
            {exitCode !== null && (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={exitCode === 0 ? "default" : "destructive"}>
                  Exit: {exitCode}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {exitCode === 0
                    ? "Migration completed. Check migrated_attachments/ for downloaded files."
                    : "Migration encountered errors. Review the logs above."}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
