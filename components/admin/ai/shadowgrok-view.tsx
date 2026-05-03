"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Crosshair,
  Eye,
  History,
  Loader2,
  Lock,
  Play,
  Send,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Terminal,
  User,
  Wrench,
  XCircle,
  Zap,
  Server,
  Radio,
  Activity,
  Target,
  FileCode,
  Globe,
  BarChart3,
  Layers,
  ChevronUp,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToolCallResult = {
  tool: string
  result: {
    success: boolean
    data?: any
    error?: string
    requiresApproval?: boolean
    approvalId?: string
    executionTimeMs?: number
  }
}

type Execution = {
  id: string
  userMessage: string
  finalResponse: string
  model: string
  status: string
  approvalRequired: boolean
  toolExecutions: number
  successfulExecutions: number
  failedExecutions: number
  createdAt: string
  toolCalls?: {
    id: string
    toolName: string
    arguments: any
    result: any
    success: boolean
    requiresApproval: boolean
    executionTimeMs: number | null
    executedAt: string
  }[]
}

type StreamEvent =
  | { type: "start"; message: string }
  | { type: "complete"; executionId: string; agentTaskId: string; finalResponse: string; toolResults: ToolCallResult[]; steps: number }
  | { type: "error"; error: string }

/* ------------------------------------------------------------------ */
/*  Tool metadata                                                      */
/* ------------------------------------------------------------------ */

const TOOL_META: Record<string, { icon: typeof Wrench; color: string; label: string; risk: "low" | "medium" | "high" | "critical" }> = {
  generate_stealth_implant_config: { icon: FileCode, color: "text-blue-400", label: "Implant Config", risk: "medium" },
  compile_and_deploy_implant: { icon: Crosshair, color: "text-amber-400", label: "Deploy Implant", risk: "high" },
  send_c2_task_to_implant: { icon: Send, color: "text-orange-400", label: "C2 Task", risk: "high" },
  query_implant_status: { icon: Activity, color: "text-emerald-400", label: "Implant Status", risk: "low" },
  trigger_kill_switch: { icon: Skull, color: "text-red-400", label: "Kill Switch", risk: "critical" },
  analyze_traffic_and_suggest_evasion: { icon: BarChart3, color: "text-cyan-400", label: "Traffic Analysis", risk: "low" },
  orchestrate_full_operation: { icon: Target, color: "text-violet-400", label: "Operation Plan", risk: "medium" },
  run_panel_command: { icon: Terminal, color: "text-red-400", label: "Panel Command", risk: "critical" },
  update_node_config: { icon: Server, color: "text-emerald-400", label: "Node Config", risk: "medium" },
  query_hysteria_traffic_stats: { icon: Radio, color: "text-blue-400", label: "Traffic Stats", risk: "low" },
  create_or_update_subscription: { icon: Globe, color: "text-violet-400", label: "Subscription", risk: "low" },
  assess_opsec_risk: { icon: Shield, color: "text-amber-400", label: "OPSEC Risk", risk: "low" },
}

const RISK_CONFIG: Record<string, { color: string; bg: string }> = {
  low: { color: "text-success", bg: "bg-success/10 border-success/20" },
  medium: { color: "text-warning", bg: "bg-warning/10 border-warning/20" },
  high: { color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" },
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
}

/* ------------------------------------------------------------------ */
/*  Quick actions                                                      */
/* ------------------------------------------------------------------ */

const QUICK_ACTION_CATEGORIES = {
  reconnaissance: {
    label: "Reconnaissance",
    icon: Activity,
    color: "text-emerald-400",
    actions: [
      { icon: Activity, label: "Implant Status", prompt: "Query the status of all active implants and check their health metrics", color: "text-emerald-400" },
      { icon: Radio, label: "Traffic Stats", prompt: "Query global Hysteria traffic stats for the last hour including bandwidth and connection metrics", color: "text-blue-400" },
      { icon: BarChart3, label: "Traffic Analysis", prompt: "Analyze traffic patterns on my primary node and suggest evasion improvements for corporate EDR threat model", color: "text-cyan-400" },
      { icon: Shield, label: "OPSEC Audit", prompt: "Assess OPSEC risk for current deployment configuration and provide mitigation recommendations", color: "text-amber-400" },
    ]
  },
  deployment: {
    label: "Deployment",
    icon: Crosshair,
    color: "text-orange-400",
    actions: [
      { icon: FileCode, label: "Gen Implant Config", prompt: "Generate a stealth implant config for Linux with maximum stealth level and Spotify traffic blending", color: "text-blue-400" },
      { icon: Crosshair, label: "Compile & Deploy", prompt: "Compile and deploy a Linux AMD64 implant to the primary node with auto-start enabled", color: "text-orange-400" },
      { icon: Server, label: "Update Node Config", prompt: "Update node configuration to use salamander obfuscation with hot reload", color: "text-emerald-400" },
      { icon: Globe, label: "Create Subscription", prompt: "Create a new subscription with default tags and hysteria2 format", color: "text-violet-400" },
    ]
  },
  operations: {
    label: "Operations",
    icon: Target,
    color: "text-violet-400",
    actions: [
      { icon: Send, label: "Send Recon Task", prompt: "Send recon task to all active implants to gather system information", color: "text-orange-400" },
      { icon: Target, label: "Plan Operation", prompt: "Orchestrate a full operation plan for establishing persistent access with low risk tolerance", color: "text-violet-400" },
      { icon: Terminal, label: "Execute Command", prompt: "Run a panel command to check system status (dry run)", color: "text-red-400" },
    ]
  },
  safety: {
    label: "Safety & Response",
    icon: Skull,
    color: "text-red-400",
    actions: [
      { icon: Skull, label: "Kill Switch Plan", prompt: "Prepare a graceful kill switch plan for all implants with 24h dead-man trigger", color: "text-red-400" },
      { icon: AlertTriangle, label: "Emergency Stop", prompt: "Trigger immediate kill switch on all implants (requires confirmation)", color: "text-red-500" },
      { icon: ShieldAlert, label: "Security Check", prompt: "Run comprehensive security check on all active nodes and implants", color: "text-amber-400" },
    ]
  }
}

const QUICK_ACTIONS = Object.values(QUICK_ACTION_CATEGORIES).flatMap(cat => cat.actions)

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ShadowGrokView() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [activeExecution, setActiveExecution] = useState<Execution | null>(null)
  const [currentToolResults, setCurrentToolResults] = useState<ToolCallResult[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamStatus, setStreamStatus] = useState("")
  const [dryRun, setDryRun] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [finalResponse, setFinalResponse] = useState("")
  const [expandedCategory, setExpandedCategory] = useState<string | null>("reconnaissance")
  const [showQuickActions, setShowQuickActions] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  /* ---- Load execution history ---- */
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await apiFetch("/api/admin/ai/shadowgrok")
      if (res.ok) {
        const data = await res.json()
        setExecutions(data.executions ?? [])
      }
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  /* ---- Load specific execution ---- */
  const loadExecution = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/ai/shadowgrok?executionId=${id}`)
      if (res.ok) {
        const data = await res.json()
        const exec = data.execution as Execution
        setActiveExecution(exec)
        setFinalResponse(exec.finalResponse)
        setCurrentToolResults(
          (exec.toolCalls ?? []).map((tc) => ({
            tool: tc.toolName,
            result: {
              success: tc.success,
              data: tc.result,
              requiresApproval: tc.requiresApproval,
              executionTimeMs: tc.executionTimeMs ?? undefined,
            },
          })),
        )
        setShowHistory(false)
      }
    } catch {
      toast.error("Failed to load execution")
    }
  }, [])

  /* ---- Execute via streaming ---- */
  const executePrompt = useCallback(
    async (promptText?: string) => {
      const text = promptText || input
      if (!text.trim() || loading) return

      setInput("")
      setLoading(true)
      setStreaming(true)
      setStreamStatus("Initializing ShadowGrok agent…")
      setFinalResponse("")
      setCurrentToolResults([])
      setActiveExecution(null)

      if (textareaRef.current) textareaRef.current.style.height = "auto"

      try {
        const res = await apiFetch("/api/admin/ai/shadowgrok/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: text.trim(),
            dryRun,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }))
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            try {
              const event = JSON.parse(trimmed.slice(6)) as StreamEvent
              handleStreamEvent(event)
            } catch {
              /* parse error, skip */
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim().startsWith("data: ")) {
          try {
            const event = JSON.parse(buffer.trim().slice(6)) as StreamEvent
            handleStreamEvent(event)
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        toast.error("Execution failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
        setStreamStatus("")
      } finally {
        setLoading(false)
        setStreaming(false)
        loadHistory()
      }
    },
    [input, loading, dryRun, loadHistory],
  )

  function handleStreamEvent(event: StreamEvent) {
    switch (event.type) {
      case "start":
        setStreamStatus(event.message)
        break
      case "complete":
        setFinalResponse(event.finalResponse)
        setCurrentToolResults(event.toolResults)
        setStreamStatus("")
        toast.success("Execution complete", {
          description: `${event.steps} step(s), ${event.toolResults.length} tool call(s)`,
        })
        // Load the full execution for history
        loadExecution(event.executionId)
        break
      case "error":
        setStreamStatus("")
        setFinalResponse(`Error: ${event.error}`)
        toast.error("Execution failed", { description: event.error })
        break
    }
    scrollToBottom()
  }

  /* ---- Copy helper ---- */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  /* ---- New execution ---- */
  const newExecution = () => {
    setActiveExecution(null)
    setFinalResponse("")
    setCurrentToolResults([])
    setStreamStatus("")
    setInput("")
    textareaRef.current?.focus()
  }

  const hasContent = finalResponse || currentToolResults.length > 0 || streaming

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]" style={{ minHeight: "calc(100vh - 220px)" }}>
      {/* ---- Main panel ---- */}
      <Card className="flex flex-col overflow-hidden shadow-lg shadow-primary/5 border-primary/20">
        {/* Header */}
        <CardHeader className="flex-shrink-0 pb-3 bg-gradient-to-b from-destructive/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/30">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success ring-2 ring-background">
                  <Activity className="h-2.5 w-2.5 text-success-foreground" />
                </div>
              </div>
              <div>
                <CardTitle className="text-heading-sm">ShadowGrok Agent</CardTitle>
                <CardDescription className="text-caption">
                  Elite C2 agent with 12 operational tools
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Dry Run Toggle */}
              <div className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all",
                dryRun 
                  ? "border-warning/30 bg-warning/10" 
                  : "border-border/50 bg-muted/30"
              )}>
                <Switch
                  id="dry-run"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                />
                <Label htmlFor="dry-run" className={cn(
                  "text-micro cursor-pointer transition-colors",
                  dryRun ? "text-warning" : "text-muted-foreground"
                )}>
                  Dry Run
                </Label>
              </div>

              {/* Status */}
              {streaming ? (
                <Badge variant="outline" className="gap-1.5 text-micro border-info/30 bg-info/10 text-info animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Executing
                </Badge>
              ) : activeExecution ? (
                <ExecutionStatusBadge status={activeExecution.status} />
              ) : (
                <Badge variant="outline" className="gap-1.5 text-micro border-success/30 bg-success/10 text-success">
                  <Zap className="h-3 w-3" />
                  Ready
                </Badge>
              )}

              <Separator orientation="vertical" className="mx-1 h-5" />

              <Button variant="ghost" size="icon-xs" onClick={() => setShowHistory(!showHistory)} title="Execution History" className="hover:bg-muted/50">
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={newExecution} className="gap-1.5 text-micro border-primary/30 hover:bg-primary/10">
                <Sparkles className="h-3 w-3" />
                New
              </Button>
            </div>
          </div>
        </CardHeader>
        <Separator />

        {/* Content */}
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-4">
              {!hasContent ? (
                /* ---- Empty state ---- */
                <div className="flex flex-col items-center justify-center text-center min-h-[450px]">
                  <div className="relative mb-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/5 ring-1 ring-destructive/30">
                      <ShieldAlert className="h-10 w-10 text-destructive" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-success ring-2 ring-background">
                      <Activity className="h-3.5 w-3.5 text-success-foreground" />
                    </div>
                  </div>
                  <h3 className="text-heading-lg mb-2">Ready for Orders</h3>
                  <p className="text-body-sm text-muted-foreground mb-6 max-w-md">
                    ShadowGrok has access to 12 C2 tools including implant generation, traffic
                    analysis, kill switches, and autonomous operation planning.
                  </p>

                  {/* Quick Actions Toggle */}
                  <div className="mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQuickActions(!showQuickActions)}
                      className="gap-2 border-primary/30 hover:bg-primary/10"
                    >
                      <Layers className="h-4 w-4" />
                      {showQuickActions ? "Hide" : "Show"} Quick Actions
                    </Button>
                  </div>

                  {/* Categorized Quick Actions */}
                  {showQuickActions && (
                    <div className="w-full max-w-3xl space-y-4 mb-6">
                      {Object.entries(QUICK_ACTION_CATEGORIES).map(([key, category]) => {
                        const CategoryIcon = category.icon
                        const isExpanded = expandedCategory === key
                        
                        return (
                          <Collapsible
                            key={key}
                            open={isExpanded}
                            onOpenChange={() => setExpandedCategory(isExpanded ? null : key)}
                          >
                            <div className="flex items-center justify-between">
                              <Button
                                variant="outline"
                                onClick={() => setExpandedCategory(isExpanded ? null : key)}
                                className={cn(
                                  "flex-1 justify-between gap-2 border-primary/30 hover:bg-primary/10",
                                  isExpanded && "bg-primary/10 border-primary/50"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <CategoryIcon className={cn("h-4 w-4", category.color)} />
                                  <span className="text-sm font-medium">{category.label}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {category.actions.length}
                                  </Badge>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <CollapsibleContent className="mt-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 rounded-lg border border-border/50 bg-muted/30">
                                {category.actions.map((action) => (
                                  <button
                                    key={action.label}
                                    onClick={() => executePrompt(action.prompt)}
                                    disabled={loading}
                                    className={cn(
                                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                                      "hover:shadow-md hover:shadow-primary/5 disabled:opacity-50",
                                      "bg-background/50 border-border/50 hover:border-primary/30 hover:bg-muted/50"
                                    )}
                                  >
                                    <div className={cn(
                                      "flex h-7 w-7 items-center justify-center rounded-md bg-background/70 shrink-0",
                                      action.color.replace("text-", "bg-").replace("-400", "/10")
                                    )}>
                                      <action.icon className={cn("h-3.5 w-3.5", action.color)} />
                                    </div>
                                    <span className="text-xs font-medium">{action.label}</span>
                                  </button>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )
                      })}
                    </div>
                  )}

                  {dryRun && (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-micro text-warning">
                      <Eye className="h-4 w-4" />
                      <span>Dry run mode — operations will be simulated, not executed</span>
                    </div>
                  )}
                </div>
              ) : (
                /* ---- Execution output ---- */
                <>
                  {/* User prompt */}
                  {(activeExecution?.userMessage || input) && (
                    <div className="flex items-start gap-3 justify-end">
                      <div className="max-w-[75%] rounded-xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
                        <p className="text-body-sm">{activeExecution?.userMessage}</p>
                      </div>
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-micro">
                          <User className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}

                  {/* Streaming status */}
                  {streaming && streamStatus && (
                    <div className="flex items-start gap-3">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-red-500/10 text-red-400 text-micro">
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="rounded-xl rounded-bl-sm bg-muted/60 border border-border/50 px-4 py-3">
                        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>{streamStatus}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tool call results */}
                  {currentToolResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-label text-muted-foreground/60">
                        <Wrench className="h-3 w-3" />
                        Tool Executions ({currentToolResults.length})
                      </div>
                      {currentToolResults.map((tr, i) => (
                        <ToolResultCard key={i} toolResult={tr} onCopy={copyToClipboard} />
                      ))}
                    </div>
                  )}

                  {/* Final response */}
                  {finalResponse && (
                    <div className="flex items-start gap-3">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="bg-red-500/10 text-red-400 text-micro">
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="group max-w-[85%] rounded-xl rounded-bl-sm bg-muted/60 border border-border/50 px-4 py-3">
                        <pre className="whitespace-pre-wrap font-mono text-body-sm text-foreground/90 leading-relaxed">
                          {finalResponse}
                        </pre>
                        <div className="mt-2 flex items-center justify-between">
                          {activeExecution && (
                            <span className="text-micro text-muted-foreground/60">
                              {new Date(activeExecution.createdAt).toLocaleTimeString()}
                            </span>
                          )}
                          <button
                            onClick={() => copyToClipboard(finalResponse)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Execution stats */}
                  {activeExecution && (
                    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-2.5">
                      <Badge variant="outline" className="text-micro gap-1">
                        <Wrench className="h-2.5 w-2.5" />
                        {activeExecution.toolExecutions} tools
                      </Badge>
                      <Badge variant="outline" className="text-micro gap-1 border-success/30 text-success">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {activeExecution.successfulExecutions} passed
                      </Badge>
                      {activeExecution.failedExecutions > 0 && (
                        <Badge variant="outline" className="text-micro gap-1 border-destructive/30 text-destructive">
                          <XCircle className="h-2.5 w-2.5" />
                          {activeExecution.failedExecutions} failed
                        </Badge>
                      )}
                      {activeExecution.approvalRequired && (
                        <Badge variant="outline" className="text-micro gap-1 border-warning/30 text-warning">
                          <Lock className="h-2.5 w-2.5" />
                          Approval Required
                        </Badge>
                      )}
                      <span className="ml-auto text-micro font-mono text-muted-foreground">
                        {activeExecution.model}
                      </span>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-border bg-card/50 p-4">
            {/* Quick Action Bar */}
            <div className="mb-3">
              <Collapsible open={showQuickActions} onOpenChange={setShowQuickActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQuickActions(!showQuickActions)}
                  className="gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2"
                >
                  <Zap className="h-3 w-3" />
                  <span className="text-xs">Quick Actions</span>
                  {showQuickActions ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
                <CollapsibleContent className="mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ACTIONS.slice(0, 8).map((action) => (
                      <Button
                        key={action.label}
                        variant="outline"
                        size="sm"
                        onClick={() => executePrompt(action.prompt)}
                        disabled={loading}
                        className="gap-1.5 h-7 px-2 text-xs border-border/50 hover:border-primary/30 hover:bg-primary/5"
                      >
                        <action.icon className={cn("h-3 w-3", action.color)} />
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  adjustTextarea()
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    executePrompt()
                  }
                }}
                placeholder="Describe your operation objective…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-body-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all"
              />
              <Button
                onClick={() => executePrompt()}
                disabled={loading || !input.trim()}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-micro text-muted-foreground/60">
              Press Enter to execute · Shift+Enter for new line
              {dryRun && <span className="ml-2 text-warning">· Dry run enabled</span>}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---- Right panel: Tools + History ---- */}
      <div className="flex flex-col gap-4">
        {/* History panel */}
        {showHistory ? (
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-heading-sm flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-primary" />
                  History
                </CardTitle>
                <Button variant="ghost" size="icon-xs" onClick={loadHistory} disabled={historyLoading}>
                  {historyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="space-y-0.5 px-3 pb-3">
                  {executions.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <History className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-caption text-muted-foreground">No executions yet</p>
                    </div>
                  ) : (
                    executions.map((exec) => (
                      <button
                        key={exec.id}
                        onClick={() => loadExecution(exec.id)}
                        className={cn(
                          "w-full rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted/50",
                          activeExecution?.id === exec.id && "bg-primary/10 ring-1 ring-primary/20",
                        )}
                      >
                        <p className="text-body-sm truncate">{exec.userMessage}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <ExecutionStatusBadge status={exec.status} small />
                          <span className="text-micro text-muted-foreground">
                            {exec.toolExecutions} tool{exec.toolExecutions !== 1 ? "s" : ""}
                          </span>
                          <span className="ml-auto text-micro tabular-nums text-muted-foreground">
                            {new Date(exec.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          /* ---- Tool Registry ---- */
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 text-primary" />
                C2 Tool Registry
              </CardTitle>
              <CardDescription className="text-caption">
                12 operational tools available
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="space-y-0.5 px-3 pb-3">
                  {Object.entries(TOOL_META).map(([name, meta]) => {
                    const Icon = meta.icon
                    const risk = RISK_CONFIG[meta.risk]
                    return (
                      <Tooltip key={name}>
                        <TooltipTrigger
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/50 transition-colors text-left"
                        >
                          <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-body-sm font-medium truncate">{meta.label}</p>
                            <code className="text-micro font-mono text-muted-foreground">{name}</code>
                          </div>
                          <Badge variant="outline" className={cn("text-micro capitalize", risk.bg, risk.color)}>
                            {meta.risk}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[240px]">
                          <p className="text-caption">{meta.label}</p>
                          <p className="text-micro text-muted-foreground mt-0.5">Risk: {meta.risk}</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Approval queue */}
        {activeExecution?.approvalRequired && (
          <ApprovalCard
            execution={activeExecution}
            onApprove={() => toast.info("Approval workflow in development")}
            onDeny={() => toast.info("Denial workflow in development")}
          />
        )}

        {/* Risk indicator */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-heading-sm flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Safety
            </CardTitle>
          </CardHeader>
          <CardContent className="text-micro text-muted-foreground space-y-2">
            <p>
              High-risk tools (<code className="rounded bg-muted px-1 py-0.5 text-foreground/70">kill_switch</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground/70">panel_command</code>) require explicit
              approval before execution.
            </p>
            <p>
              All executions are logged to{" "}
              <span className="text-foreground/70 font-medium">ShadowGrokExecution</span> with full audit trail.
            </p>
            {dryRun && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-2.5 py-1.5 text-warning">
                <Eye className="h-3 w-3" />
                Dry run active
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool Result Card                                                   */
/* ------------------------------------------------------------------ */

function ToolResultCard({
  toolResult,
  onCopy,
}: {
  toolResult: ToolCallResult
  onCopy: (text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = TOOL_META[toolResult.tool]
  const Icon = meta?.icon ?? Wrench
  const risk = RISK_CONFIG[meta?.risk ?? "low"]
  const isSuccess = toolResult.result.success
  const formatted = JSON.stringify(toolResult.result.data ?? toolResult.result.error, null, 2)

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div
        className={cn(
          "ml-10 rounded-xl border overflow-hidden",
          isSuccess ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5",
        )}
      >
        <CollapsibleTrigger
          render={<button type="button" />}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
        >
          <Icon className={cn("h-3.5 w-3.5 shrink-0", meta?.color ?? "text-muted-foreground")} />
          <span className="text-body-sm font-medium">{meta?.label ?? toolResult.tool}</span>
          {isSuccess ? (
            <CheckCircle2 className="h-3 w-3 text-success" />
          ) : (
            <XCircle className="h-3 w-3 text-destructive" />
          )}
          {toolResult.result.executionTimeMs != null && (
            <span className="text-micro tabular-nums text-muted-foreground">
              {toolResult.result.executionTimeMs}ms
            </span>
          )}
          {toolResult.result.requiresApproval && (
            <Badge variant="outline" className="text-micro border-warning/30 text-warning gap-1">
              <Lock className="h-2.5 w-2.5" />
              Approval
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopy(formatted)
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            >
              <Copy className="h-3 w-3" />
            </button>
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator className={isSuccess ? "bg-success/10" : "bg-destructive/10"} />
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-micro text-muted-foreground">
            {formatted}
          </pre>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

/* ------------------------------------------------------------------ */
/*  Approval Card                                                      */
/* ------------------------------------------------------------------ */

function ApprovalCard({
  execution,
  onApprove,
  onDeny,
}: {
  execution: Execution
  onApprove: () => void
  onDeny: () => void
}) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-heading-sm flex items-center gap-2 text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          Approval Required
        </CardTitle>
        <CardDescription className="text-caption">
          A high-risk operation requires manual approval before execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-body-sm text-muted-foreground truncate">
          {execution.userMessage}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onApprove} className="flex-1 gap-1.5 bg-success hover:bg-success/90 text-success-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onDeny} className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
            <XCircle className="h-3 w-3" />
            Deny
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Execution Status Badge                                             */
/* ------------------------------------------------------------------ */

function ExecutionStatusBadge({ status, small }: { status: string; small?: boolean }) {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    running: { className: "border-info/30 bg-info/10 text-info", icon: <Loader2 className={cn("animate-spin", small ? "h-2.5 w-2.5" : "h-3 w-3")} /> },
    completed: { className: "border-success/30 bg-success/10 text-success", icon: <CheckCircle2 className={small ? "h-2.5 w-2.5" : "h-3 w-3"} /> },
    failed: { className: "border-destructive/30 bg-destructive/10 text-destructive", icon: <XCircle className={small ? "h-2.5 w-2.5" : "h-3 w-3"} /> },
    pending_approval: { className: "border-warning/30 bg-warning/10 text-warning", icon: <Lock className={small ? "h-2.5 w-2.5" : "h-3 w-3"} /> },
  }
  const c = config[status] ?? config.completed
  return (
    <Badge variant="outline" className={cn("gap-1 capitalize", small ? "text-micro px-1.5 py-0" : "text-micro", c.className)}>
      {c.icon}
      {status.replace("_", " ")}
    </Badge>
  )
}
