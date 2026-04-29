"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type ToolCall = {
  id: string
  name: string
  arguments: string
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

const CATEGORY_COLORS: Record<string, string> = {
  config: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  traffic: "bg-green-500/10 text-green-700 dark:text-green-300",
  troubleshoot: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  management: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  payload: "bg-red-500/10 text-red-700 dark:text-red-300",
}

/* ------------------------------------------------------------------ */
/*  Main view                                                         */
/* ------------------------------------------------------------------ */

export function AiChatView() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sidebarLoading, setSidebarLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  /* ---- Load conversations + templates on mount ---- */
  useEffect(() => {
    const init = async () => {
      const [convRes, tmplRes] = await Promise.allSettled([
        fetch("/api/admin/ai/conversations"),
        fetch("/api/admin/ai/templates"),
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
        const res = await fetch(`/api/admin/ai/conversations/${id}`)
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
      const res = await fetch("/api/admin/ai/conversations", {
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
        await fetch(`/api/admin/ai/conversations/${id}`, { method: "DELETE" })
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
      setLoading(true)
      setTimeout(scrollToBottom, 100)

      try {
        const res = await fetch("/api/admin/ai/chat", {
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

        // Replace messages with the full set from API (skip the user msg we already added)
        setMessages((prev) => {
          const withoutPending = prev.slice(0, -1) // remove the optimistic user msg
          return [...withoutPending, ...newMsgs]
        })

        // Update sidebar
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, updatedAt: Date.now(), messages: [...c.messages, ...newMsgs] }
              : c,
          ),
        )

        setTimeout(scrollToBottom, 100)
      } catch (err) {
        toast.error("AI request failed", {
          description: err instanceof Error ? err.message : "unknown",
        })
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Request failed"}`,
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Multi-tool agent for config generation, traffic analysis, troubleshooting,
          payload creation, and infrastructure management. Conversations are stored in Firestore for audit.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr_280px]">
        {/* ---- Sidebar: Conversations ---- */}
        <div className="flex flex-col gap-3">
          <Button onClick={createConversation} className="w-full" size="sm">
            + New Conversation
          </Button>

          <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
            {sidebarLoading ? (
              <p className="text-xs text-muted-foreground px-2 py-4">Loading…</p>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">
                No conversations yet
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${
                    activeId === conv.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => selectConversation(conv.id)}
                >
                  <span className="flex-1 truncate">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    className={`opacity-0 group-hover:opacity-100 text-xs transition-opacity ${
                      activeId === conv.id
                        ? "text-primary-foreground/70 hover:text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Del
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ---- Chat panel ---- */}
        <Card
          className="flex flex-col"
          style={{ minHeight: "500px" } as React.CSSProperties}
        >
          <CardContent className="flex flex-1 flex-col p-0">
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!activeId ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select a conversation or start a new one
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Start by typing a prompt or selecting a template →
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
              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground animate-pulse">
                    Thinking… (may call tools)
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
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
                  rows={2}
                  disabled={!activeId && !loading}
                  className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  className="self-end"
                >
                  {loading ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---- Right panel: Templates + Info ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Task Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => sendMessage(t.prompt)}
                  disabled={loading}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        CATEGORY_COLORS[t.category] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.category}
                    </span>
                    <span className="text-xs font-medium">{t.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {t.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Available Tools</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <ToolBadge name="generate_config" desc="Generate server configs" />
              <ToolBadge name="analyze_traffic" desc="Analyze traffic + anomalies" />
              <ToolBadge name="suggest_masquerade" desc="Masquerade target suggestions" />
              <ToolBadge name="troubleshoot" desc="Diagnostic checks" />
              <ToolBadge name="list_profiles" desc="List config profiles" />
              <ToolBadge name="get_server_logs" desc="View server logs" />
              <ToolBadge name="generate_payload" desc="Build EXE/ELF/PS1/Python payloads" />
              <ToolBadge name="list_payloads" desc="List payload builds" />
              <ToolBadge name="get_payload_status" desc="Check build status" />
              <ToolBadge name="delete_payload" desc="Delete payload artifacts" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">About</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>
                This assistant uses your configured LLM provider (set via{" "}
                <code className="rounded bg-muted px-1">LLM_PROVIDER_BASE_URL</code> and{" "}
                <code className="rounded bg-muted px-1">LLM_PROVIDER_API_KEY</code>).
              </p>
              <p>
                All conversations and tool calls are persisted in Firestore for audit.
                Generated configs and payloads are <strong>previews only</strong> — review before deployment.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function ToolBadge({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px]">{name}</code>
      <span className="text-[11px]">{desc}</span>
    </div>
  )
}

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
        {msg.content ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-muted px-4 py-3 text-sm">
              <p>{msg.content}</p>
            </div>
          </div>
        ) : null}
        {msg.toolCalls.map((tc) => (
          <ToolCallBubble key={tc.id} call={tc} />
        ))}
      </div>
    )
  }

  const isUser = msg.role === "user"
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {!isUser && msg.content ? (
          <div className="relative">
            <pre className="whitespace-pre-wrap font-mono text-xs">{msg.content}</pre>
            <Button
              variant="ghost"
              size="xs"
              className="absolute right-0 top-0"
              onClick={() => onCopy(msg.content ?? "")}
            >
              Copy
            </Button>
          </div>
        ) : (
          <p>{msg.content}</p>
        )}
        <p className="mt-1 text-[10px] opacity-60">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}

function ToolCallBubble({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  let args = ""
  try {
    args = JSON.stringify(JSON.parse(call.arguments), null, 2)
  } catch {
    args = call.arguments
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-blue-700 dark:text-blue-300">
            Tool call:
          </span>
          <code className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono">
            {call.name}
          </code>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? "hide args" : "show args"}
          </button>
        </div>
        {expanded ? (
          <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
            {args}
          </pre>
        ) : null}
      </div>
    </div>
  )
}

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
  const truncated = formatted.length > 300 && !expanded

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-lg border px-4 py-2 text-xs ${
          isError
            ? "border-red-500/20 bg-red-500/5"
            : "border-green-500/20 bg-green-500/5"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`font-medium ${
              isError
                ? "text-red-700 dark:text-red-300"
                : "text-green-700 dark:text-green-300"
            }`}
          >
            {isError ? "Tool error:" : "Tool result:"}
          </span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{result.name}</code>
          <button
            onClick={() => onCopy(result.content)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            copy
          </button>
        </div>
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
          {truncated ? formatted.slice(0, 300) + "…" : formatted}
        </pre>
        {formatted.length > 300 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? "show less" : "show more"}
          </button>
        ) : null}
      </div>
    </div>
  )
}
