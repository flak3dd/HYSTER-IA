"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  MessageSquarePlus,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Terminal,
  Info,
  MessageSquare,
  Activity,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type ToolCall = {
  id: string
  name: string
  arguments: string
  status?: "executing" | "completed" | "failed"
}

type ToolResult = {
  toolCallId: string
  name: string
  content: string
}

type ChatMessage = {
  role: "user" | "assistant" | "tool" | "system"
  content: string | null
  toolCalls?: ToolCall[]
  toolResult?: ToolResult
  timestamp: number
}

type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

type Template = {
  id: string
  label: string
  description: string
  prompt: string
  category: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const CATEGORY_CONFIG: Record<string, { color: string; label: string }> = {
  config: { color: "border-blue-500/30 bg-blue-500/10 text-blue-400", label: "Config" },
  traffic: { color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", label: "Traffic" },
  troubleshoot: { color: "border-amber-500/30 bg-amber-500/10 text-amber-400", label: "Troubleshoot" },
  management: { color: "border-violet-500/30 bg-violet-500/10 text-violet-400", label: "Management" },
  payload: { color: "border-red-500/30 bg-red-500/10 text-red-400", label: "Payload" },
}

const TOOLS_LIST = [
  { name: "generate_config", desc: "Generate server configs", icon: Terminal },
  { name: "analyze_traffic", desc: "Analyze traffic + anomalies", icon: Zap },
  { name: "suggest_masquerade", desc: "Masquerade target suggestions", icon: Sparkles },
  { name: "troubleshoot", desc: "Diagnostic checks", icon: AlertTriangle },
  { name: "list_profiles", desc: "List config profiles", icon: Info },
  { name: "get_server_logs", desc: "View server logs", icon: Terminal },
  { name: "generate_payload", desc: "Build payloads", icon: Wrench },
  { name: "list_payloads", desc: "List payload builds", icon: Clipboard },
  { name: "get_payload_status", desc: "Check build status", icon: CheckCircle2 },
  { name: "delete_payload", desc: "Delete payload artifacts", icon: Trash2 },
]

/* ------------------------------------------------------------------ */
/*  Main view                                                         */
/* ------------------------------------------------------------------ */

export function AiChatView({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sidebarLoading, setSidebarLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  /* ---- Auto-resize textarea ---- */
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  /* ---- Load conversations + templates on mount ---- */
  useEffect(() => {
    const init = async () => {
      const [convRes, tmplRes] = await Promise.allSettled([
        apiFetch("/api/admin/ai/conversations"),
        apiFetch("/api/admin/ai/templates"),
      ])
      if (convRes.status === "fulfilled" && convRes.value.ok) {
        const data = await convRes.value.json()
        setConversations(data.conversations ?? [])
      }
      if (tmplRes.status === "fulfilled" && tmplRes.value.ok) {
        const data = await tmplRes.value.json()
        setTemplates(data.templates ?? [])
      }
      setSidebarLoading(false)
    }
    init()
  }, [])

  /* ---- Select conversation ---- */
  const selectConversation = useCallback(
    async (id: string) => {
      setActiveId(id)
      const cached = conversations.find((c) => c.id === id)
      if (cached) {
        setMessages(cached.messages)
        setTimeout(scrollToBottom, 100)
        return
      }
      try {
        const res = await apiFetch(`/api/admin/ai/conversations/${id}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.conversation.messages ?? [])
          setTimeout(scrollToBottom, 100)
        }
      } catch {
        /* ignore */
      }
    },
    [conversations, scrollToBottom],
  )

  /* ---- Create new conversation ---- */
  const createConversation = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/ai/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "New conversation" }),
      })
      if (res.ok) {
        const data = await res.json()
        const conv = data.conversation as Conversation
        setConversations((prev) => [conv, ...prev])
        setActiveId(conv.id)
        setMessages([])
        return conv.id
      }
    } catch {
      toast.error("Failed to create conversation")
    }
    return null
  }, [])

  /* ---- Delete conversation ---- */
  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/admin/ai/conversations/${id}`, { method: "DELETE" })
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
        }
        toast.success("Conversation deleted")
      } catch {
        toast.error("Failed to delete conversation")
      }
    },
    [activeId],
  )

  /* ---- Send message ---- */
  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || loading) return

      let convId = activeId
      if (!convId) {
        convId = await createConversation()
        if (!convId) return
      }

      const userMsg: ChatMessage = {
        role: "user",
        content: prompt.trim(),
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
      setLoading(true)
      setTimeout(scrollToBottom, 100)

      try {
        const res = await apiFetch("/api/admin/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            message: prompt.trim(),
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }))
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }

        const data = await res.json()
        const newMsgs = (data.messages as ChatMessage[]) ?? []

        setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, ...newMsgs]
        })

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, updatedAt: Date.now(), messages: [...c.messages, ...newMsgs] }
              : c,
          ),
        )

        setTimeout(scrollToBottom, 100)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Request failed"
        toast.error("AI request failed", {
          description: errorMessage,
          action: {
            label: "Retry",
            onClick: () => sendMessage(prompt),
          },
        })
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: `Error: ${errorMessage}. Please try again or use a different approach.`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setLoading(false)
      }
    },
    [activeId, loading, createConversation, scrollToBottom],
  )

  /* ---- Copy helper ---- */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  /* ---- Template categories ---- */
  const categories = [...new Set(templates.map((t) => t.category))]

  return (
    <div className="flex flex-col gap-6">
      {!hideHeader && (
        <div>
          <h1 className="text-heading-xl">AI Assistant</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Multi-tool agent for config generation, traffic analysis, troubleshooting,
            payload creation, and infrastructure management.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_300px]" style={{ minHeight: hideHeader ? "calc(100vh - 280px)" : "calc(100vh - 220px)" }}>
        {/* ---- Left: Conversations ---- */}
        <div className="flex flex-col gap-3">
          <Button 
            onClick={createConversation} 
            className="w-full gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" 
            size="sm"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New Conversation
          </Button>

          <div className="relative flex-1 rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <ScrollArea className="flex-1 h-full">
              <div className="space-y-0.5 p-2">
                {sidebarLoading ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                      <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-caption text-muted-foreground">
                      No conversations yet
                    </p>
                    <p className="text-micro text-muted-foreground/60">
                      Start a new conversation to begin
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-all",
                        activeId === conv.id
                          ? "bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm"
                          : "hover:bg-muted/50 text-foreground border border-transparent hover:border-border/30",
                      )}
                      onClick={() => selectConversation(conv.id)}
                    >
                      <Bot className={cn("h-3.5 w-3.5 shrink-0", activeId === conv.id ? "text-primary" : "opacity-50")} />
                      <span className="flex-1 truncate text-body-sm">{conv.title}</span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                deleteConversation(conv.id)
                              }}
                              className={cn(
                                "opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5",
                                "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                              )}
                            />
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent side="right">Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* ---- Center: Chat panel ---- */}
        <Card className="flex flex-col overflow-hidden shadow-lg shadow-primary/5 border-primary/20">
          {/* Messages area */}
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-4">
              {!activeId ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                  <div className="relative mb-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
                      <Sparkles className="h-10 w-10 text-primary glow-primary" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-success ring-2 ring-background">
                      <Activity className="h-3.5 w-3.5 text-success-foreground" />
                    </div>
                  </div>
                  <h3 className="text-heading-lg mb-2">AI Operations Assistant</h3>
                  <p className="text-body-sm text-muted-foreground max-w-md">
                    Select a conversation or start a new one. Use templates on the right for common tasks.
                  </p>
                  <Button 
                    onClick={createConversation}
                    className="mt-6 gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    Start New Conversation
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                    <Bot className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-heading-md mb-2">Ready for instructions</h3>
                  <p className="text-body-sm text-muted-foreground">
                    Type a prompt below or select a template to begin.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <MessageBubble
                    key={`${msg.timestamp}-${i}`}
                    msg={msg}
                    onCopy={copyToClipboard}
                  />
                ))
              )}
              {loading && (
                <div className="flex items-start gap-3">
                  <Avatar className="h-7 w-7 shrink-0 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary text-micro">
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-body-sm text-primary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Processing…</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-micro text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
                      <span>Analyzing request and executing tools</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-border/50 bg-gradient-to-b from-card/50 to-card p-4">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
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
                      sendMessage(input)
                    }
                  }}
                  placeholder={
                    activeId
                      ? "Ask about your Hysteria2 infrastructure…"
                      : "Start a new conversation first…"
                  }
                  rows={1}
                  disabled={!activeId && !loading}
                  className="flex-1 resize-none rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-body-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all shadow-inner"
                />
                {activeId && (
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    <Badge variant="outline" className="h-5 px-1.5 text-micro border-primary/30 bg-primary/10 text-primary">
                      10 tools
                    </Badge>
                  </div>
                )}
              </div>
              <Button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-micro text-muted-foreground/60 text-center">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </Card>

        {/* ---- Right panel: Templates + Tools ---- */}
        <div className="flex flex-col gap-4">
          {/* Templates */}
          <Card className="flex flex-col shadow-lg shadow-primary/5 border-primary/20">
            <CardHeader className="pb-3 bg-gradient-to-b from-primary/5 to-transparent">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue={categories[0] ?? "config"} className="w-full">
                <div className="px-4 pb-2 border-b border-border/50">
                  <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0">
                    {categories.map((cat) => (
                      <TabsTrigger
                        key={cat}
                        value={cat}
                        className="text-micro px-2.5 py-1 rounded-md capitalize data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
                      >
                        {CATEGORY_CONFIG[cat]?.label ?? cat}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {categories.map((cat) => (
                  <TabsContent key={cat} value={cat} className="mt-0">
                    <ScrollArea className="h-[260px]">
                      <div className="space-y-1.5 px-4 pb-4">
                        {templates
                          .filter((t) => t.category === cat)
                          .map((t) => (
                            <button
                              key={t.id}
                              onClick={() => sendMessage(t.prompt)}
                              disabled={loading}
                              className="w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2.5 text-left transition-all hover:bg-muted/50 hover:border-primary/30 hover:shadow-sm disabled:opacity-50 group"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-body-sm font-medium group-hover:text-primary transition-colors">
                                  {t.label}
                                </span>
                                {cat === "payload" && (
                                  <Badge variant="outline" className="h-4 px-1 text-micro border-destructive/30 bg-destructive/10 text-destructive">
                                    Risk
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 text-micro text-muted-foreground line-clamp-2">
                                {t.description}
                              </p>
                            </button>
                          ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Available Tools */}
          <Card className="shadow-lg shadow-primary/5 border-primary/20">
            <CardHeader className="pb-3 bg-gradient-to-b from-primary/5 to-transparent">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Wrench className="h-3.5 w-3.5 text-primary" />
                </div>
                Available Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-1">
                  {TOOLS_LIST.map((tool) => {
                    const Icon = tool.icon
                    return (
                      <div
                        key={tool.name}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-3 w-3 shrink-0 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <code className="text-micro font-mono text-foreground/80 group-hover:text-primary transition-colors">{tool.name}</code>
                          <p className="text-micro text-muted-foreground truncate">{tool.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Provider Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-primary" />
                Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="text-micro text-muted-foreground space-y-2">
              <p>
                Uses your configured LLM provider via{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground/70">LLM_PROVIDER_BASE_URL</code>.
              </p>
              <p>
                Conversations persisted in Firestore for audit. Generated configs are{" "}
                <span className="text-warning font-medium">previews only</span>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                       */
/* ------------------------------------------------------------------ */

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        {icon}
      </div>
      <div>
        <h3 className="text-heading-md">{title}</h3>
        <p className="mt-1 text-body-sm text-muted-foreground max-w-sm">{description}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Message Bubble                                                    */
/* ------------------------------------------------------------------ */

function MessageBubble({
  msg,
  onCopy,
}: {
  msg: ChatMessage
  onCopy: (text: string) => void
}) {
  if (msg.role === "tool" && msg.toolResult) {
    return <ToolResultBubble result={msg.toolResult} onCopy={onCopy} />
  }

  if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {msg.content && (
          <AssistantMessage content={msg.content} onCopy={onCopy} timestamp={msg.timestamp} />
        )}
        {msg.toolCalls.map((tc) => (
          <ToolCallBubble key={tc.id} call={tc} />
        ))}
      </div>
    )
  }

  const isUser = msg.role === "user"

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[75%] rounded-xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
          <p className="text-body-sm">{msg.content}</p>
          <p className="mt-1.5 text-micro opacity-50">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-micro">
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
      </div>
    )
  }

  return (
    <AssistantMessage
      content={msg.content ?? ""}
      onCopy={onCopy}
      timestamp={msg.timestamp}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Assistant Message                                                 */
/* ------------------------------------------------------------------ */

function AssistantMessage({
  content,
  onCopy,
  timestamp,
}: {
  content: string
  onCopy: (text: string) => void
  timestamp: number
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary text-micro">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="group max-w-[80%] rounded-xl rounded-bl-sm bg-muted/60 border border-border/50 px-4 py-3">
        <pre className="whitespace-pre-wrap font-mono text-body-sm text-foreground/90 leading-relaxed">
          {content}
        </pre>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-micro text-muted-foreground/60">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
          <button
            onClick={() => onCopy(content)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool Call Bubble                                                  */
/* ------------------------------------------------------------------ */

function ToolCallBubble({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  let args = ""
  try {
    args = JSON.stringify(JSON.parse(call.arguments), null, 2)
  } catch {
    args = call.arguments
  }

  return (
    <div className="flex items-start gap-3 ml-10">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="rounded-xl border border-info/20 bg-info/5 overflow-hidden">
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-info/10 transition-colors"
          >
            <Wrench className="h-3 w-3 text-info shrink-0" />
            <span className="text-micro font-medium text-info">Tool call</span>
            <code className="rounded bg-info/10 px-1.5 py-0.5 font-mono text-micro text-info-foreground">
              {call.name}
            </code>
            <span className="ml-auto">
              {expanded ? (
                <ChevronDown className="h-3 w-3 text-info/50" />
              ) : (
                <ChevronRight className="h-3 w-3 text-info/50" />
              )}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="bg-info/10" />
            <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-micro text-muted-foreground">
              {args}
            </pre>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool Result Bubble                                                */
/* ------------------------------------------------------------------ */

function ToolResultBubble({
  result,
  onCopy,
}: {
  result: ToolResult
  onCopy: (text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  let formatted = ""
  try {
    formatted = JSON.stringify(JSON.parse(result.content), null, 2)
  } catch {
    formatted = result.content
  }
  const isError =
    result.content.includes('"error"') && !result.content.includes('"error":null')
  const isLong = formatted.length > 300

  return (
    <div className="flex items-start gap-3 ml-10">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div
          className={cn(
            "rounded-xl border overflow-hidden",
            isError
              ? "border-destructive/20 bg-destructive/5"
              : "border-success/20 bg-success/5",
          )}
        >
          <div className="flex items-center gap-2 px-4 py-2.5">
            {isError ? (
              <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
            ) : (
              <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
            )}
            <span
              className={cn(
                "text-micro font-medium",
                isError ? "text-destructive" : "text-success",
              )}
            >
              {isError ? "Tool error" : "Tool result"}
            </span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-micro">
              {result.name}
            </code>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onCopy(result.content)}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              >
                <Copy className="h-3 w-3" />
              </button>
              {isLong && (
                <CollapsibleTrigger
                  render={<button type="button" />}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </CollapsibleTrigger>
              )}
            </div>
          </div>
          <Separator className={isError ? "bg-destructive/10" : "bg-success/10"} />
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-micro text-muted-foreground">
            {isLong && !expanded ? formatted.slice(0, 300) + "…" : formatted}
          </pre>
        </div>
      </Collapsible>
    </div>
  )
}
