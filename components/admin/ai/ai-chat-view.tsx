"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  Search,
  Filter,
  X,
  Download,
  XCircle,
  Keyboard,
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

type ProgressEvent = {
  type: "step" | "tool_start" | "tool_complete" | "tool_error"
  step?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
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
  tags: string[]
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
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "recent" | "with-tools" | "tag">("all")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [editingTagsForId, setEditingTagsForId] = useState<string | null>(null)
  const [newTag, setNewTag] = useState("")
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [messagesPage, setMessagesPage] = useState(1)
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([])
  const [currentProgressIndex, setCurrentProgressIndex] = useState(0)
  const MESSAGES_PER_PAGE = 20
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  /* ---- Filter conversations ---- */
  const filteredConversations = conversations.filter(conv => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesTitle = conv.title.toLowerCase().includes(query)
      const matchesMessages = conv.messages.some(msg => 
        msg.content?.toLowerCase().includes(query)
      )
      if (!matchesTitle && !matchesMessages) return false
    }
    
    // Type filter
    if (filterType === "recent") {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      if (conv.updatedAt < oneWeekAgo) return false
    } else if (filterType === "with-tools") {
      const hasTools = conv.messages.some(msg => msg.toolCalls && msg.toolCalls.length > 0)
      if (!hasTools) return false
    } else if (filterType === "tag" && selectedTag) {
      if (!conv.tags.includes(selectedTag)) return false
    }
    
    return true
  }).sort((a, b) => b.updatedAt - a.updatedAt)

  /* ---- Get all unique tags ---- */
  const allTags = [...new Set(conversations.flatMap(c => c.tags))].sort()

  /* ---- Add tag to conversation ---- */
  const addTag = async (conversationId: string, tag: string) => {
    if (!tag.trim()) return
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return
    
    const updatedTags = [...new Set([...conv.tags, tag.trim()])]
    try {
      const res = await apiFetch("/api/admin/ai/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, tags: updatedTags }),
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(prev => prev.map(c => 
          c.id === conversationId ? { ...c, tags: updatedTags } : c
        ))
        toast.success("Tag added")
      }
    } catch {
      toast.error("Failed to add tag")
    }
  }

  /* ---- Remove tag from conversation ---- */
  const removeTag = async (conversationId: string, tag: string) => {
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return
    
    const updatedTags = conv.tags.filter(t => t !== tag)
    try {
      const res = await apiFetch("/api/admin/ai/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, tags: updatedTags }),
      })
      if (res.ok) {
        setConversations(prev => prev.map(c => 
          c.id === conversationId ? { ...c, tags: updatedTags } : c
        ))
        toast.success("Tag removed")
      }
    } catch {
      toast.error("Failed to remove tag")
    }
  }

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
      setMessagesPage(1)
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

  /* ---- Paginated messages ---- */
  const paginatedMessages = messages.slice(0, messagesPage * MESSAGES_PER_PAGE)
  const hasMoreMessages = messages.length > paginatedMessages.length

  const loadMoreMessages = () => {
    setMessagesPage(prev => prev + 1)
  }

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

      // Reset progress state
      setProgressEvents([])
      setCurrentProgressIndex(0)

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
        const progress = (data.progress as ProgressEvent[]) ?? []

        // Set progress events for animation
        setProgressEvents(progress)

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

  /* ---- Export conversation ---- */
  const exportConversation = (format: "json" | "markdown" | "txt") => {
    if (!activeId) return
    
    const conv = conversations.find(c => c.id === activeId)
    if (!conv) return

    let content: string
    let filename: string
    let mimeType: string

    if (format === "json") {
      content = JSON.stringify(conv, null, 2)
      filename = `conversation-${conv.id}.json`
      mimeType = "application/json"
    } else if (format === "markdown") {
      content = `# ${conv.title}\n\n`
      content += `**Created:** ${new Date(conv.createdAt).toLocaleString()}\n`
      content += `**Updated:** ${new Date(conv.updatedAt).toLocaleString()}\n`
      content += `**Tags:** ${conv.tags.join(", ") || "None"}\n\n---\n\n`
      
      for (const msg of conv.messages) {
        const role = msg.role === "user" ? "👤 User" : msg.role === "assistant" ? "🤖 Assistant" : msg.role === "tool" ? "🔧 Tool" : "⚙️ System"
        content += `### ${role}\n\n${msg.content || "No content"}\n\n`
        
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          content += "**Tool Calls:**\n"
          for (const tc of msg.toolCalls) {
            content += `- ${tc.name}\n`
          }
          content += "\n"
        }
      }
      
      filename = `conversation-${conv.id}.md`
      mimeType = "text/markdown"
    } else {
      content = `${conv.title}\n`
      content += `${"=".repeat(conv.title.length)}\n\n`
      content += `Created: ${new Date(conv.createdAt).toLocaleString()}\n`
      content += `Updated: ${new Date(conv.updatedAt).toLocaleString()}\n`
      content += `Tags: ${conv.tags.join(", ") || "None"}\n\n`
      content += `${"=".repeat(50)}\n\n`
      
      for (const msg of conv.messages) {
        const role = msg.role === "user" ? "USER" : msg.role === "assistant" ? "ASSISTANT" : msg.role === "tool" ? "TOOL" : "SYSTEM"
        content += `[${role}]\n${msg.content || "No content"}\n\n`
      }
      
      filename = `conversation-${conv.id}.txt`
      mimeType = "text/plain"
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast.success(`Exported as ${format.toUpperCase()}`)
  }

  /* ---- Template categories ---- */
  const categories = [...new Set(templates.map((t) => t.category))]

  /* ---- Tool usage analytics ---- */
  const toolUsageStats = useMemo(() => {
    const toolCounts: Record<string, number> = {}
    let totalToolCalls = 0
    let successfulToolCalls = 0

    conversations.forEach(conv => {
      conv.messages.forEach(msg => {
        if (msg.toolCalls) {
          msg.toolCalls.forEach(tc => {
            toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1
            totalToolCalls++
          })
        }
        if (msg.role === 'tool' && msg.toolResult) {
          successfulToolCalls++
        }
      })
    })

    const sortedTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    return {
      totalToolCalls,
      successfulToolCalls,
      successRate: totalToolCalls > 0 ? Math.round((successfulToolCalls / totalToolCalls) * 100) : 100,
      topTools: sortedTools,
    }
  }, [conversations])

  /* ---- Animate progress events ---- */
  useEffect(() => {
    if (progressEvents.length > 0 && currentProgressIndex < progressEvents.length) {
      const timer = setTimeout(() => {
        setCurrentProgressIndex(prev => prev + 1)
      }, 800) // Show each step for 800ms
      return () => clearTimeout(timer)
    }
  }, [progressEvents, currentProgressIndex])

/* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      
      // Ctrl/Cmd + N: New conversation
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault()
        createConversation()
      }
      
      // Ctrl/Cmd + /: Show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
      }
      
      // Escape: Close shortcuts or deselect
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false)
        }
        if (editingTagsForId) {
          setEditingTagsForId(null)
        }
        if (activeId) {
          textareaRef.current?.focus()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showShortcuts, editingTagsForId, activeId, createConversation])

  return (
    <div className="flex flex-col gap-6">
      {!hideHeader && (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-heading-xl">AI Assistant</h1>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Multi-tool agent for config generation, traffic analysis, troubleshooting,
              payload creation, and infrastructure management.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowShortcuts(true)}
            className="gap-1 text-micro text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="h-3 w-3" />
            Shortcuts
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_280px] md:grid-cols-[240px_1fr] grid-cols-1" style={{ minHeight: hideHeader ? "calc(100vh - 200px)" : "calc(100vh - 160px)" }}>
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

          {/* Search and Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-body-sm rounded-lg border border-border/50 bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-muted-foreground/60"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant={filterType === "all" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 text-micro h-7"
                onClick={() => setFilterType("all")}
              >
                All
              </Button>
              <Button
                variant={filterType === "recent" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 text-micro h-7"
                onClick={() => setFilterType("recent")}
              >
                Recent
              </Button>
              <Button
                variant={filterType === "with-tools" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 text-micro h-7"
                onClick={() => setFilterType("with-tools")}
              >
                Tools
              </Button>
              <Button
                variant={filterType === "tag" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 text-micro h-7"
                onClick={() => setFilterType("tag")}
              >
                Tags
              </Button>
            </div>
            
            {filterType === "tag" && allTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-micro transition-colors",
                      selectedTag === tag
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex-1 rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <ScrollArea className="flex-1 h-full">
              <div className="space-y-0.5 p-2">
                {sidebarLoading ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                      <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {searchQuery ? "No conversations found" : "No conversations yet"}
                    </p>
                    <p className="text-micro text-muted-foreground/60">
                      {searchQuery ? "Try a different search term" : "Start a new conversation to begin"}
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex flex-col gap-1.5 rounded-lg px-3 py-2.5 cursor-pointer transition-all",
                        activeId === conv.id
                          ? "bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm"
                          : "hover:bg-muted/50 text-foreground border border-transparent hover:border-border/30",
                      )}
                      onClick={() => selectConversation(conv.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Bot className={cn("h-3.5 w-3.5 shrink-0", activeId === conv.id ? "text-primary" : "opacity-50")} />
                        <span className="flex-1 truncate text-body-sm">{conv.title}</span>
                        <div className="flex items-center gap-1">
                          {editingTagsForId === conv.id ? (
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                setEditingTagsForId(null)
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : (
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                setEditingTagsForId(conv.id)
                              }}
                              className={cn(
                                "opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5",
                                "text-muted-foreground hover:text-primary hover:bg-primary/10",
                              )}
                            >
                              <Filter className="h-3 w-3" />
                            </button>
                          )}
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
                      </div>
                      
                      {/* Tags display */}
                      {editingTagsForId === conv.id ? (
                        <div className="flex items-center gap-1 ml-5.5">
                          <input
                            type="text"
                            placeholder="Add tag..."
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newTag.trim()) {
                                e.preventDefault()
                                addTag(conv.id, newTag)
                                setNewTag("")
                              }
                            }}
                            className="flex-1 px-2 py-1 text-micro rounded border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {conv.tags.map(tag => (
                            <div
                              key={tag}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-micro"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {tag}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeTag(conv.id, tag)
                                }}
                                className="hover:text-destructive"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : conv.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-5.5">
                          {conv.tags.map(tag => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground text-micro"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* ---- Center: Chat panel ---- */}
        <Card className="flex flex-col overflow-hidden shadow-lg shadow-primary/5 border-primary/20">
          {activeId && (
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-border/50 bg-gradient-to-b from-primary/5 to-transparent">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-body-sm font-medium text-foreground">
                  {conversations.find(c => c.id === activeId)?.title || "Conversation"}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" className="gap-1 text-micro text-muted-foreground hover:text-foreground">
                      <Download className="h-3 w-3" />
                      Export
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportConversation("json")}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportConversation("markdown")}>
                    Export as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportConversation("txt")}>
                    Export as Text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
          )}
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
                <>
                  {hasMoreMessages && (
                    <div className="flex justify-center py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadMoreMessages}
                        className="text-micro text-muted-foreground hover:text-foreground"
                      >
                        Load older messages ({messages.length - paginatedMessages.length} remaining)
                      </Button>
                    </div>
                  )}
                  {paginatedMessages.map((msg, i) => (
                    <MessageBubble
                      key={`${msg.timestamp}-${i}`}
                      msg={msg}
                      onCopy={copyToClipboard}
                    />
                  ))}
                </>
              )}
              {loading && (
                <div className="flex items-start gap-3">
                  <Avatar className="h-7 w-7 shrink-0 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary text-micro">
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 px-4 py-3 shadow-sm w-full max-w-md">
                    {progressEvents.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-body-sm text-primary">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Working on your request…</span>
                        </div>
                        <div className="space-y-1.5 mt-3">
                          {progressEvents.slice(0, currentProgressIndex + 1).map((event, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-micro">
                              <div className={cn(
                                "mt-0.5 h-1.5 w-1.5 rounded-full shrink-0",
                                idx === currentProgressIndex ? "bg-primary animate-pulse" : "bg-success"
                              )} />
                              <div className="flex-1">
                                {event.type === "step" && (
                                  <span className="text-foreground/80">{event.step}</span>
                                )}
                                {event.type === "tool_start" && (
                                  <span className="text-foreground/80">
                                    Running <code className="text-primary font-mono">{event.toolName}</code>
                                  </span>
                                )}
                                {event.type === "tool_complete" && (
                                  <span className="text-success">
                                    ✓ <code className="font-mono">{event.toolName}</code> completed
                                  </span>
                                )}
                                {event.type === "tool_error" && (
                                  <span className="text-destructive">
                                    ✗ <code className="font-mono">{event.toolName}</code> failed
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-body-sm text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Processing…</span>
                      </div>
                    )}
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

        {/* ---- Right panel: Resources ---- */}
        <div className="flex flex-col gap-3 hidden lg:flex">
          <Card className="flex flex-col shadow-lg shadow-primary/5 border-primary/20">
            <CardContent className="p-0">
              <Tabs defaultValue="templates" className="w-full">
                <div className="px-3 pt-3 pb-2 border-b border-border/50">
                  <TabsList className="w-full h-auto bg-muted/50 p-0.5">
                    <TabsTrigger
                      value="templates"
                      className="flex-1 gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-2 py-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      Templates
                    </TabsTrigger>
                    <TabsTrigger
                      value="tools"
                      className="flex-1 gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-2 py-1.5"
                    >
                      <Wrench className="h-3 w-3" />
                      Tools
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="templates" className="mt-0">
                  <Tabs defaultValue={categories[0] ?? "config"} className="w-full">
                    <div className="px-3 pb-2 border-b border-border/50">
                      <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0">
                        {categories.map((cat) => (
                          <TabsTrigger
                            key={cat}
                            value={cat}
                            className="text-xs px-2 py-1 rounded-md capitalize data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                          >
                            {CATEGORY_CONFIG[cat]?.label ?? cat}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>
                    {categories.map((cat) => (
                      <TabsContent key={cat} value={cat} className="mt-0">
                        <ScrollArea className="h-[280px]">
                          <div className="space-y-1.5 px-3 pb-3">
                            {templates
                              .filter((t) => t.category === cat)
                              .map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => sendMessage(t.prompt)}
                                  disabled={loading}
                                  className="w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-left transition-all hover:bg-muted/50 hover:border-primary/30 disabled:opacity-50 group"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                      {t.label}
                                    </span>
                                    {cat === "payload" && (
                                      <Badge variant="outline" className="h-4 px-1 text-xs border-destructive/30 bg-destructive/10 text-destructive">
                                        Risk
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                    {t.description}
                                  </p>
                                </button>
                              ))}
                          </div>
                        </ScrollArea>
                      </TabsContent>
                    ))}
                  </Tabs>
                </TabsContent>

                <TabsContent value="tools" className="mt-0">
                  <ScrollArea className="h-[340px]">
                    <div className="space-y-1 px-3 pb-3">
                      {TOOLS_LIST.map((tool) => {
                        const Icon = tool.icon
                        return (
                          <div
                            key={tool.name}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors group"
                          >
                            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 group-hover:bg-primary/20 transition-colors">
                              <Icon className="h-3 w-3 shrink-0 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <code className="text-xs font-mono text-foreground/80 group-hover:text-primary transition-colors">{tool.name}</code>
                              <p className="text-xs text-muted-foreground truncate">{tool.desc}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="shadow-lg shadow-primary/5 border-primary/20">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-background/50 border border-border/50 p-2">
                  <div className="text-xs text-muted-foreground">Total Calls</div>
                  <div className="text-sm font-semibold text-foreground">{toolUsageStats.totalToolCalls}</div>
                </div>
                <div className="rounded-lg bg-background/50 border border-border/50 p-2">
                  <div className="text-xs text-muted-foreground">Success Rate</div>
                  <div className={cn(
                    "text-sm font-semibold",
                    toolUsageStats.successRate >= 90 ? "text-success" : toolUsageStats.successRate >= 70 ? "text-warning" : "text-destructive"
                  )}>
                    {toolUsageStats.successRate}%
                  </div>
                </div>
              </div>
              
              {toolUsageStats.topTools.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">Top Tools</div>
                  <div className="space-y-1.5">
                    {toolUsageStats.topTools.slice(0, 3).map((tool, i) => (
                      <div key={tool.name} className="flex items-center gap-2">
                        <div className="flex h-4 w-4 items-center justify-center rounded bg-primary/10 text-xs text-primary">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <code className="text-xs font-mono text-foreground truncate block">{tool.name}</code>
                        </div>
                        <Badge variant="outline" className="text-xs h-5 px-1.5">
                          {tool.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-sm">Focus search</span>
              <kbd className="px-2 py-1 rounded bg-muted text-micro font-mono">
                <span className="text-muted-foreground">⌘</span> K
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-body-sm">New conversation</span>
              <kbd className="px-2 py-1 rounded bg-muted text-micro font-mono">
                <span className="text-muted-foreground">⌘</span> N
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-body-sm">Show shortcuts</span>
              <kbd className="px-2 py-1 rounded bg-muted text-micro font-mono">
                <span className="text-muted-foreground">⌘</span> /
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-body-sm">Send message</span>
              <kbd className="px-2 py-1 rounded bg-muted text-micro font-mono">
                Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-body-sm">New line</span>
              <kbd className="px-2 py-1 rounded bg-muted text-micro font-mono">
                Shift + Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-body-sm">Close / Escape</span>
              <kbd className="px-2 py-1 rounded bg-muted text-micro font-mono">
                Esc
              </kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

  const status = call.status || "executing"
  const isExecuting = status === "executing"
  const isCompleted = status === "completed"
  const isFailed = status === "failed"

  return (
    <div className="flex items-start gap-3 ml-10">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className={cn(
          "rounded-xl border overflow-hidden transition-all",
          isExecuting ? "border-info/20 bg-info/5" : isCompleted ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
        )}>
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isExecuting ? (
                <Loader2 className="h-3 w-3 text-info shrink-0 animate-spin" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive shrink-0" />
              )}
              <span className={cn(
                "text-micro font-medium",
                isExecuting ? "text-info" : isCompleted ? "text-success" : "text-destructive"
              )}>
                {isExecuting ? "Executing" : isCompleted ? "Completed" : "Failed"}
              </span>
            </div>
            <code className={cn(
              "rounded px-1.5 py-0.5 font-mono text-micro",
              isExecuting ? "bg-info/10 text-info-foreground" : isCompleted ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive-foreground"
            )}>
              {call.name}
            </code>
            {isExecuting && (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse" />
                <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse delay-100" />
                <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse delay-200" />
              </div>
            )}
            <span className="ml-auto">
              {expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              )}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="bg-border/50" />
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-micro text-muted-foreground">
                <Terminal className="h-3 w-3" />
                <span>Arguments</span>
              </div>
              <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg bg-background/50 px-3 py-2 font-mono text-micro text-foreground">
                {args}
              </pre>
            </div>
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
