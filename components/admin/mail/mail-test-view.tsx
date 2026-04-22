"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types (client-side mirrors of server types)                       */
/* ------------------------------------------------------------------ */

type SafeMailAccount = {
  id: string
  protocol: "imap" | "pop3"
  host: string
  port: number
  secure: boolean
  user: string
  mailbox: string
  label?: string
}

type MailTestResult = {
  accountId: string
  label: string | null
  protocol: string
  status: "pass" | "fail"
  latencyMs: number
  messageCount?: number
  error?: string
  testedAt: string
}

type AutoTestState = {
  enabled: boolean
  intervalMinutes: number
  lastRun: string | null
  nextRun: string | null
  results: MailTestResult[]
}

type MailMessage = {
  uid: number | string
  subject: string | null
  from: string | null
  to: string | null
  date: string | null
  attachments: Array<{ filename: string; size: number; contentType: string }>
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function MailTestView() {
  const [accounts, setAccounts] = useState<SafeMailAccount[]>([])
  const [autoState, setAutoState] = useState<AutoTestState | null>(null)
  const [loading, setLoading] = useState(true)
  const [testingAll, setTestingAll] = useState(false)
  const [testingSingle, setTestingSingle] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  // SMTP test form
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")
  const [smtpFrom, setSmtpFrom] = useState("")
  const [sendTo, setSendTo] = useState("")
  const [sendSubject, setSendSubject] = useState("D-Panel Mail Test")
  const [sendBody, setSendBody] = useState(
    "This is an automated test message from D-Panel.",
  )
  const [sendingTest, setSendingTest] = useState(false)

  // Auto-test interval form
  const [intervalInput, setIntervalInput] = useState("30")

  /* ---- Initial data load ---- */
  useEffect(() => {
    async function load() {
      try {
        const [acctRes, stateRes] = await Promise.all([
          fetch("/api/admin/mail/accounts", { cache: "no-store" }),
          fetch("/api/admin/mail/auto-test", { cache: "no-store" }),
        ])
        if (acctRes.ok) {
          const data = await acctRes.json()
          setAccounts(data.accounts ?? [])
        }
        if (stateRes.ok) {
          const data = await stateRes.json()
          setAutoState(data)
          if (data.intervalMinutes) setIntervalInput(String(data.intervalMinutes))
        }
      } catch (err) {
        toast.error("Failed to load mail data", {
          description: err instanceof Error ? err.message : "unknown",
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  /* ---- Test all accounts ---- */
  const testAll = useCallback(async () => {
    setTestingAll(true)
    try {
      const res = await fetch("/api/admin/mail/test-all", {
        method: "POST",
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setAutoState((prev) =>
        prev
          ? { ...prev, results: data.results, lastRun: new Date().toISOString() }
          : { enabled: false, intervalMinutes: 30, lastRun: new Date().toISOString(), nextRun: null, results: data.results },
      )
      const passed = (data.results as MailTestResult[]).filter((r) => r.status === "pass").length
      toast.success(`Tested ${data.results.length} accounts`, {
        description: `${passed} passed, ${data.results.length - passed} failed`,
      })
    } catch (err) {
      toast.error("Test-all failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setTestingAll(false)
    }
  }, [])

  /* ---- Test single account ---- */
  const testSingle = useCallback(async (id: string) => {
    setTestingSingle(id)
    try {
      const res = await fetch(`/api/admin/mail/accounts/${id}/test`, {
        method: "POST",
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      toast.success(`Account ${id}: connected`, {
        description: `${data.count ?? 0} messages in mailbox`,
      })
    } catch (err) {
      toast.error(`Account ${id}: failed`, {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setTestingSingle(null)
    }
  }, [])

  /* ---- Load messages for an account ---- */
  const loadMessages = useCallback(async (id: string) => {
    setSelectedAccount(id)
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/admin/mail/accounts/${id}/messages?limit=20`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch (err) {
      toast.error("Failed to load messages", {
        description: err instanceof Error ? err.message : "unknown",
      })
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  /* ---- Auto-test controls ---- */
  const toggleAutoTest = useCallback(
    async (action: "enable" | "disable") => {
      try {
        const res = await fetch("/api/admin/mail/auto-test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            intervalMinutes: action === "enable" ? Number(intervalInput) || 30 : undefined,
          }),
        })
        if (!res.ok) throw new Error(`${res.status}`)
        const data = await res.json()
        setAutoState(data)
        toast.success(action === "enable" ? "Auto-test enabled" : "Auto-test disabled")
      } catch (err) {
        toast.error("Failed to update auto-test", {
          description: err instanceof Error ? err.message : "unknown",
        })
      }
    },
    [intervalInput],
  )

  /* ---- Send test email ---- */
  const handleSendTest = useCallback(async () => {
    setSendingTest(true)
    try {
      const res = await fetch("/api/admin/mail/send-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          smtp: {
            host: smtpHost,
            port: Number(smtpPort) || 587,
            secure: smtpSecure,
            user: smtpUser,
            password: smtpPass,
            from: smtpFrom || undefined,
          },
          to: sendTo,
          subject: sendSubject,
          body: sendBody,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? `${res.status}`)
      }
      const data = await res.json()
      toast.success("Test email sent", {
        description: `Message ID: ${(data as { messageId?: string }).messageId ?? "unknown"}`,
      })
    } catch (err) {
      toast.error("Send failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSendingTest(false)
    }
  }, [smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, sendTo, sendSubject, sendBody])

  /* ---- Helpers ---- */
  const resultForAccount = (id: string): MailTestResult | undefined =>
    autoState?.results.find((r) => r.accountId === id)

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading mail accounts...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Auto Mailing Test System</h1>
        <p className="text-sm text-muted-foreground">
          Test mail account connectivity, send test emails, and schedule automated health checks.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ================================================================ */}
        {/*  ACCOUNTS & CONNECTIVITY PANEL                                   */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Mail Accounts</CardTitle>
                <CardDescription className="text-xs">
                  {accounts.length} configured account{accounts.length !== 1 && "s"}
                </CardDescription>
              </div>
              <Button size="sm" onClick={testAll} disabled={testingAll || accounts.length === 0}>
                {testingAll ? "Testing..." : "Test All"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[440px] overflow-y-auto">
            {accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No mail accounts configured. Set MAIL_ACCOUNTS_FILE or MAIL_ACCOUNTS_JSON env var.
              </p>
            ) : (
              accounts.map((acct) => {
                const result = resultForAccount(acct.id)
                return (
                  <div
                    key={acct.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3",
                      selectedAccount === acct.id && "border-primary bg-muted/50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {acct.label ?? acct.user}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {acct.protocol.toUpperCase()}
                        </Badge>
                        {result && (
                          <Badge
                            variant={result.status === "pass" ? "default" : "destructive"}
                            className="text-[10px]"
                          >
                            {result.status === "pass"
                              ? `OK ${result.latencyMs}ms`
                              : "FAIL"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {acct.host}:{acct.port} &bull; {acct.mailbox}
                        {result?.messageCount !== undefined && ` &bull; ${result.messageCount} msgs`}
                      </p>
                      {result?.error && (
                        <p className="text-xs text-destructive truncate">{result.error}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testSingle(acct.id)}
                        disabled={testingSingle === acct.id}
                      >
                        {testingSingle === acct.id ? "..." : "Test"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => loadMessages(acct.id)}
                      >
                        Inbox
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/*  AUTO-TEST SCHEDULER                                             */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Auto-Test Scheduler</CardTitle>
                <CardDescription className="text-xs">
                  Periodically test all accounts on a timer
                </CardDescription>
              </div>
              <Badge variant={autoState?.enabled ? "default" : "secondary"}>
                {autoState?.enabled ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1 flex-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  toggleAutoTest(autoState?.enabled ? "disable" : "enable")
                }
              >
                {autoState?.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="outline" onClick={testAll} disabled={testingAll}>
                Run Now
              </Button>
            </div>

            {autoState?.lastRun && (
              <p className="text-xs text-muted-foreground">
                Last run: {new Date(autoState.lastRun).toLocaleString()}
              </p>
            )}
            {autoState?.nextRun && (
              <p className="text-xs text-muted-foreground">
                Next run: {new Date(autoState.nextRun).toLocaleString()}
              </p>
            )}

            {/* Results summary */}
            {autoState && autoState.results.length > 0 && (
              <div className="space-y-1 pt-2 border-t">
                <p className="text-xs font-medium">Last Results</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold">{autoState.results.length}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-md bg-emerald-500/10 p-2">
                    <p className="text-lg font-bold text-emerald-600">
                      {autoState.results.filter((r) => r.status === "pass").length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Passed</p>
                  </div>
                  <div className="rounded-md bg-red-500/10 p-2">
                    <p className="text-lg font-bold text-red-600">
                      {autoState.results.filter((r) => r.status === "fail").length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/*  SMTP SEND TEST                                                  */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">SMTP Send Test</CardTitle>
            <CardDescription className="text-xs">
              Send a test email through any SMTP server to verify delivery
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">SMTP Host</label>
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Port</label>
                <input
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Username</label>
                <input
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                className="accent-primary"
              />
              Use TLS (port 465)
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <input
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  placeholder="(defaults to username)"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <input
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="test@example.com"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <input
                value={sendSubject}
                onChange={(e) => setSendSubject(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Body</label>
              <textarea
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSendTest}
              disabled={sendingTest || !smtpHost || !smtpUser || !smtpPass || !sendTo}
            >
              {sendingTest ? "Sending..." : "Send Test Email"}
            </Button>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/*  INBOX PREVIEW                                                   */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Inbox Preview</CardTitle>
                <CardDescription className="text-xs">
                  {selectedAccount
                    ? `Viewing: ${accounts.find((a) => a.id === selectedAccount)?.label ?? selectedAccount}`
                    : "Click \"Inbox\" on an account to preview messages"}
                </CardDescription>
              </div>
              {selectedAccount && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadMessages(selectedAccount)}
                  disabled={loadingMessages}
                >
                  {loadingMessages ? "Loading..." : "Refresh"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="max-h-[440px] overflow-y-auto space-y-2">
            {!selectedAccount ? (
              <p className="text-xs text-muted-foreground">No account selected.</p>
            ) : loadingMessages ? (
              <p className="text-xs text-muted-foreground">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No messages found.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.uid}
                  className="rounded-lg border p-3 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate flex-1">
                      {msg.subject ?? "(no subject)"}
                    </p>
                    {msg.attachments.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {msg.attachments.length} file{msg.attachments.length !== 1 && "s"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>From: {msg.from ?? "unknown"}</span>
                    <span>To: {msg.to ?? "unknown"}</span>
                  </div>
                  {msg.date && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(msg.date).toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/*  FULL TEST RESULTS TABLE                                         */}
      {/* ================================================================ */}
      {autoState && autoState.results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Test Results Detail</CardTitle>
            <CardDescription className="text-xs">
              Detailed results from the last test run
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">Account</th>
                    <th className="text-left py-2 pr-4">Protocol</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2 pr-4">Latency</th>
                    <th className="text-right py-2 pr-4">Messages</th>
                    <th className="text-left py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {autoState.results.map((r) => (
                    <tr key={r.accountId} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.label ?? r.accountId}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary" className="text-[10px]">
                          {r.protocol.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={r.status === "pass" ? "default" : "destructive"}
                          className="text-[10px]"
                        >
                          {r.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.latencyMs}ms
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.messageCount ?? "-"}
                      </td>
                      <td className="py-2 text-xs text-destructive truncate max-w-[300px]">
                        {r.error ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
