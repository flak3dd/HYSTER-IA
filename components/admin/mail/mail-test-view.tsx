"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

  // Resend email test state
  const [resendTo, setResendTo] = useState("")
  const [resendSubject, setResendSubject] = useState("D-Panel Resend Test")
  const [resendBody, setResendBody] = useState(
    "This is an automated test message from D-Panel via Resend.",
  )
  const [sendingResend, setSendingResend] = useState(false)

  // Tunnel script send state
  const [tunnelTo, setTunnelTo] = useState("")
  const [tunnelNodeId, setTunnelNodeId] = useState("")
  const [tunnelType, setTunnelType] = useState("hysteria2")
  const [tunnelConfig, setTunnelConfig] = useState("")
  const [customSubject, setCustomSubject] = useState("")
  const [customMessage, setCustomMessage] = useState("")
  const [sendingTunnel, setSendingTunnel] = useState(false)

  // Auto-test interval form
  const [intervalInput, setIntervalInput] = useState("30")

  // Template editor state
  const [activeTab, setActiveTab] = useState("accounts")
  const [templates, setTemplates] = useState<Array<{id: string; name: string; subject: string; htmlContent: string; textContent: string; variables?: string[]}>>([])
  const [selectedTemplate, setSelectedTemplate] = useState<{id: string; name: string; subject: string; htmlContent: string; textContent: string; variables?: string[]} | null>(null)
  const [templateName, setTemplateName] = useState("")
  const [templateSubject, setTemplateSubject] = useState("")
  const [templateHtml, setTemplateHtml] = useState("")
  const [templateText, setTemplateText] = useState("")
  const [templateVariables, setTemplateVariables] = useState<string[]>([])

  // Queue state
  const [queueStats, setQueueStats] = useState<{pending: number; processing: number; sent: number; failed: number; total: number} | null>(null)
  const [queueEmails, setQueueEmails] = useState<Array<{id: string; to: string; subject: string; status: string; error?: string}>>([])
  const [queueConfig, setQueueConfig] = useState<{maxConcurrent: number; rateLimitPerMinute: number; retryAttempts: number; retryDelayMs: number} | null>(null)

  // Tracking state
  const [trackingEvents, setTrackingEvents] = useState<Array<{id: string; recipient: string; type: string; timestamp: string}>>([])

  // Bounce state
  const [bounceEvents, setBounceEvents] = useState<Array<{id: string; recipient: string; bounceReason: string; bounceType: string; timestamp: string}>>([])
  const [bounceStats, setBounceStats] = useState<{total: number; hard: number; soft: number; complaints: number; unknown: number} | null>(null)
  const [suppressedEmails, setSuppressedEmails] = useState<string[]>([])

  /* ---- Test all accounts ---- */
  const testAll = useCallback(async () => {
    setTestingAll(true)
    try {
      const res = await apiFetch("/api/admin/mail/test-all", {
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
      const res = await apiFetch(`/api/admin/mail/accounts/${id}/test`, {
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
      const res = await apiFetch(`/api/admin/mail/accounts/${id}/messages?limit=20`, {
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
        const res = await apiFetch("/api/admin/mail/auto-test", {
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
      const res = await apiFetch("/api/admin/mail/send-test", {
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

  /* ---- Send Resend test email ---- */
  const handleSendResend = useCallback(async () => {
    setSendingResend(true)
    try {
      const res = await apiFetch("/api/admin/mail/resend/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: resendTo,
          subject: resendSubject,
          html: `<div style="font-family:sans-serif;padding:20px;">
            <h2 style="color:#333;">D-Panel Resend Test</h2>
            <p>${resendBody}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
            <p style="color:#999;font-size:12px;">
              Sent at ${new Date().toISOString()} by D-Panel via Resend
            </p>
          </div>`,
          text: resendBody,
          type: "notification",
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? `${res.status}`)
      }
      const data = await res.json()
      toast.success("Resend email sent", {
        description: `Message ID: ${data.messageId ?? "unknown"}`,
      })
    } catch (err) {
      toast.error("Resend send failed", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSendingResend(false)
    }
  }, [resendTo, resendSubject, resendBody])

  /* ---- Send tunnel script ---- */
  const handleSendTunnel = useCallback(async () => {
    setSendingTunnel(true)
    try {
      const res = await fetch("/api/mailer/send-tunnel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: tunnelTo,
          nodeId: tunnelNodeId || undefined,
          tunnelType: tunnelType || undefined,
          tunnelConfig: tunnelConfig || undefined,
          customSubject: customSubject || undefined,
          customMessage: customMessage || undefined,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? `${res.status}`)
      }
      const data = await res.json()
      toast.success("Tunnel script sent", {
        description: `Message ID: ${data.messageId ?? "unknown"}`,
      })
      // Clear form
      setTunnelTo("")
      setTunnelNodeId("")
      setTunnelType("hysteria2")
      setTunnelConfig("")
      setCustomSubject("")
      setCustomMessage("")
    } catch (err) {
      toast.error("Failed to send tunnel script", {
        description: err instanceof Error ? err.message : "unknown",
      })
    } finally {
      setSendingTunnel(false)
    }
  }, [tunnelTo, tunnelNodeId, tunnelType, tunnelConfig, customSubject, customMessage])

  /* ---- Helpers ---- */
  const resultForAccount = (id: string): MailTestResult | undefined =>
    autoState?.results.find((r) => r.accountId === id)

  /* ---- Template functions ---- */
  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/mail/templates", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch {
      toast.error("Failed to load templates")
    }
  }, [])

  const saveTemplate = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/mail/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedTemplate?.id || `template_${Date.now()}`,
          name: templateName,
          subject: templateSubject,
          htmlContent: templateHtml,
          textContent: templateText,
          variables: templateVariables,
        }),
      })
      if (!res.ok) throw new Error("Failed to save template")
      toast.success("Template saved successfully")
      loadTemplates()
      setSelectedTemplate(null)
      setTemplateName("")
      setTemplateSubject("")
      setTemplateHtml("")
      setTemplateText("")
      setTemplateVariables([])
    } catch {
      toast.error("Failed to save template")
    }
  }, [selectedTemplate, templateName, templateSubject, templateHtml, templateText, templateVariables, loadTemplates])

  const deleteTemplate = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/mail/templates?id=${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete template")
      toast.success("Template deleted")
      loadTemplates()
    } catch {
      toast.error("Failed to delete template")
    }
  }, [loadTemplates])

  const extractTemplateVariables = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/mail/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "extract-variables",
          htmlContent: templateHtml,
          textContent: templateText,
          subject: templateSubject,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplateVariables(data.variables || [])
      }
    } catch {
      console.error("Failed to extract variables")
    }
  }, [templateHtml, templateText, templateSubject])

  /* ---- Queue functions ---- */
  const loadQueueData = useCallback(async () => {
    try {
      const [statsRes, emailsRes, configRes] = await Promise.all([
        apiFetch("/api/admin/mail/queue?action=stats", { cache: "no-store" }),
        apiFetch("/api/admin/mail/queue", { cache: "no-store" }),
        apiFetch("/api/admin/mail/queue?action=config", { cache: "no-store" }),
      ])
      
      if (statsRes.ok) setQueueStats(await statsRes.json())
      if (emailsRes.ok) {
        const data = await emailsRes.json()
        setQueueEmails(data.emails || [])
      }
      if (configRes.ok) setQueueConfig(await configRes.json())
    } catch {
      toast.error("Failed to load queue data")
    }
  }, [])

  /* ---- Tracking functions ---- */
  const loadTrackingData = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/mail/tracking", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setTrackingEvents(data.events || [])
      }
    } catch {
      toast.error("Failed to load tracking data")
    }
  }, [])

  /* ---- Bounce functions ---- */
  const loadBounceData = useCallback(async () => {
    try {
      const [statsRes, suppressedRes] = await Promise.all([
        apiFetch("/api/admin/mail/bounce?action=stats", { cache: "no-store" }),
        apiFetch("/api/admin/mail/bounce?action=suppressed", { cache: "no-store" }),
      ])
      
      if (statsRes.ok) setBounceStats(await statsRes.json())
      if (suppressedRes.ok) {
        const data = await suppressedRes.json()
        setSuppressedEmails(data.emails || [])
      }
      
      const eventsRes = await apiFetch("/api/admin/mail/bounce", { cache: "no-store" })
      if (eventsRes.ok) {
        const data = await eventsRes.json()
        setBounceEvents(data.events || [])
      }
    } catch {
      toast.error("Failed to load bounce data")
    }
  }, [])

  /* ---- Load data when tab changes ---- */
  useEffect(() => {
    if (activeTab === "queue") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadQueueData()
    } else if (activeTab === "tracking") {
      loadTrackingData()
    } else if (activeTab === "bounce") {
      loadBounceData()
    }
  }, [activeTab, loadQueueData, loadTrackingData, loadBounceData])

  /* ---- Initial data load ---- */
  useEffect(() => {
    async function load() {
      try {
        const [acctRes, stateRes] = await Promise.all([
          apiFetch("/api/admin/mail/accounts", { cache: "no-store" }),
          apiFetch("/api/admin/mail/auto-test", { cache: "no-store" }),
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
        loadTemplates()
      } catch (err) {
        toast.error("Failed to load mail data", {
          description: err instanceof Error ? err.message : "unknown",
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [loadTemplates])

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading mail accounts...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading-xl">Auto Mailing Test System</h1>
        <p className="text-sm text-muted-foreground">
          Test mail account connectivity, send test emails, schedule automated health checks, and manage email campaigns.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="bounce">Bounce</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
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
        {/*  RESEND SEND TEST                                                 */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Resend Send Test</CardTitle>
            <CardDescription className="text-xs">
              Send a test email via Resend API (configured in .env)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input
                value={resendTo}
                onChange={(e) => setResendTo(e.target.value)}
                placeholder="test@example.com"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <input
                value={resendSubject}
                onChange={(e) => setResendSubject(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Body</label>
              <textarea
                value={resendBody}
                onChange={(e) => setResendBody(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSendResend}
              disabled={sendingResend || !resendTo}
            >
              {sendingResend ? "Sending..." : "Send via Resend"}
            </Button>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/*  TUNNEL SCRIPT SENDER                                            */}
        {/* ================================================================ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Send Tunnel Script</CardTitle>
            <CardDescription className="text-xs">
              Send Hysteria 2 tunnel configuration via email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Recipient Email</label>
              <input
                type="email"
                value={tunnelTo}
                onChange={(e) => setTunnelTo(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Node ID (optional)</label>
                <input
                  value={tunnelNodeId}
                  onChange={(e) => setTunnelNodeId(e.target.value)}
                  placeholder="node-123"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tunnel Type</label>
                <select
                  value={tunnelType}
                  onChange={(e) => setTunnelType(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="hysteria2">Hysteria 2</option>
                  <option value="vmess">VMess</option>
                  <option value="vless">VLESS</option>
                  <option value="trojan">Trojan</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Custom Tunnel Config (optional)</label>
              <textarea
                value={tunnelConfig}
                onChange={(e) => setTunnelConfig(e.target.value)}
                placeholder="Leave empty to use default configuration template"
                rows={4}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Custom Subject (optional)</label>
              <input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Default: Hysteria 2 Tunnel Configuration"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Custom Message (optional)</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Default message about keeping configuration secure"
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSendTunnel}
              disabled={sendingTunnel || !tunnelTo}
            >
              {sendingTunnel ? "Sending..." : "Send Tunnel Script"}
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
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Email Template Editor</CardTitle>
              <CardDescription className="text-xs">
                Create and manage email templates with variable substitution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Button onClick={extractTemplateVariables} variant="outline" size="sm">
                  Extract Variables
                </Button>
                <Button onClick={saveTemplate} size="sm">
                  Save Template
                </Button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <input
                  type="text"
                  placeholder="Email subject with {{variable}} placeholders"
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">HTML Content</label>
                  <textarea
                    placeholder="<html><body>Hello {{name}},...</body></html>"
                    value={templateHtml}
                    onChange={(e) => setTemplateHtml(e.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Text Content</label>
                  <textarea
                    placeholder="Hello {{name}},..."
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              {templateVariables.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Detected Variables</label>
                  <div className="flex flex-wrap gap-2">
                    {templateVariables.map((v) => (
                      <Badge key={v} variant="secondary" className="text-xs">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">Saved Templates</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No templates saved yet.</p>
                  ) : (
                    templates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-2 rounded border">
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.subject}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedTemplate(t)
                              setTemplateName(t.name)
                              setTemplateSubject(t.subject)
                              setTemplateHtml(t.htmlContent)
                              setTemplateText(t.textContent)
                              setTemplateVariables(t.variables || [])
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteTemplate(t.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Queue Statistics</CardTitle>
                <CardDescription className="text-xs">Current queue status</CardDescription>
              </CardHeader>
              <CardContent>
                {queueStats ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-2xl font-bold">{queueStats.pending}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                    <div className="rounded-md bg-blue-500/10 p-3">
                      <p className="text-2xl font-bold text-blue-600">{queueStats.processing}</p>
                      <p className="text-xs text-muted-foreground">Processing</p>
                    </div>
                    <div className="rounded-md bg-emerald-500/10 p-3">
                      <p className="text-2xl font-bold text-emerald-600">{queueStats.sent}</p>
                      <p className="text-xs text-muted-foreground">Sent</p>
                    </div>
                    <div className="rounded-md bg-red-500/10 p-3">
                      <p className="text-2xl font-bold text-red-600">{queueStats.failed}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading stats...</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Queue Configuration</CardTitle>
                <CardDescription className="text-xs">Rate limiting and concurrency settings</CardDescription>
              </CardHeader>
              <CardContent>
                {queueConfig ? (
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Max Concurrent:</span> {queueConfig.maxConcurrent}</p>
                    <p><span className="font-medium">Rate Limit:</span> {queueConfig.rateLimitPerMinute}/min</p>
                    <p><span className="font-medium">Retry Attempts:</span> {queueConfig.retryAttempts}</p>
                    <p><span className="font-medium">Retry Delay:</span> {queueConfig.retryDelayMs}ms</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading config...</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Queued Emails</CardTitle>
              <CardDescription className="text-xs">Emails waiting to be sent</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto">
              {queueEmails.length === 0 ? (
                <p className="text-xs text-muted-foreground">No emails in queue.</p>
              ) : (
                <div className="space-y-2">
                  {queueEmails.map((email) => (
                    <div key={email.id} className="p-3 rounded border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{email.to}</p>
                          <p className="text-xs text-muted-foreground">{email.subject}</p>
                        </div>
                        <Badge variant={
                          email.status === "sent" ? "default" :
                          email.status === "failed" ? "destructive" :
                          email.status === "processing" ? "secondary" : "outline"
                        }>
                          {email.status}
                        </Badge>
                      </div>
                      {email.error && (
                        <p className="text-xs text-destructive mt-1">{email.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Email Tracking Events</CardTitle>
              <CardDescription className="text-xs">Track opens, clicks, and engagement</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto">
              {trackingEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tracking events yet.</p>
              ) : (
                <div className="space-y-2">
                  {trackingEvents.map((event) => (
                    <div key={event.id} className="p-3 rounded border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{event.recipient}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.type === "pixel" ? "Email Opened" : "Link Clicked"}
                          </p>
                        </div>
                        <Badge variant="secondary">{event.type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bounce" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Bounce Statistics</CardTitle>
                <CardDescription className="text-xs">Email delivery failures</CardDescription>
              </CardHeader>
              <CardContent>
                {bounceStats ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-2xl font-bold">{bounceStats.total}</p>
                      <p className="text-xs text-muted-foreground">Total Bounces</p>
                    </div>
                    <div className="rounded-md bg-red-500/10 p-3">
                      <p className="text-2xl font-bold text-red-600">{bounceStats.hard}</p>
                      <p className="text-xs text-muted-foreground">Hard Bounces</p>
                    </div>
                    <div className="rounded-md bg-yellow-500/10 p-3">
                      <p className="text-2xl font-bold text-yellow-600">{bounceStats.soft}</p>
                      <p className="text-xs text-muted-foreground">Soft Bounces</p>
                    </div>
                    <div className="rounded-md bg-orange-500/10 p-3">
                      <p className="text-2xl font-bold text-orange-600">{bounceStats.complaints}</p>
                      <p className="text-xs text-muted-foreground">Complaints</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading stats...</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Suppressed Emails</CardTitle>
                <CardDescription className="text-xs">Emails blocked from future sends</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[200px] overflow-y-auto">
                {suppressedEmails.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No suppressed emails.</p>
                ) : (
                  <div className="space-y-1">
                    {suppressedEmails.map((email) => (
                      <p key={email} className="text-sm font-mono">{email}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Bounce Events</CardTitle>
              <CardDescription className="text-xs">Detailed bounce information</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto">
              {bounceEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No bounce events yet.</p>
              ) : (
                <div className="space-y-2">
                  {bounceEvents.map((event) => (
                    <div key={event.id} className="p-3 rounded border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{event.recipient}</p>
                          <p className="text-xs text-muted-foreground">{event.bounceReason}</p>
                        </div>
                        <Badge variant={
                          event.bounceType === "hard" ? "destructive" :
                          event.bounceType === "complaint" ? "secondary" : "outline"
                        }>
                          {event.bounceType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
