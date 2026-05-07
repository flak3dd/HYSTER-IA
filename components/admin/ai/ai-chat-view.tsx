"use client"
import { apiFetch } from "@/lib/api/fetch"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  ListChecks,
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
  Search,
  X,
  Download,
  XCircle,
  Keyboard,
  PanelLeft,
  PanelRight,
  Tag,
  Clipboard,
  BarChart3,
  History,
  Square,
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
  clientMessageId?: string
  pending?: boolean
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

type GuideStep = {
  id: string
  title: string
  outcome: string
  prompt: string
}

type OpProfileId =
  | "node_setup"
  | "beacon_build"
  | "deployment"
  | "post_exploit"
  | "monitoring"

type OpProfileSignal = {
  id: OpProfileId
  label: string
  detected: boolean
  evidence: string[]
}

type OpGuideContext = {
  primaryProfile: OpProfileId
  profiles: OpProfileSignal[]
  env: {
    hysteriaConfigured: boolean
    shadowGrokEnabled: boolean
    mailConfigured: boolean
    threatIntelConfigured: boolean
  }
}

type ChatApiResponse = {
  messages?: ChatMessage[]
  error?: string
  errorCode?: string
  progress?: ProgressEvent[]
  fromIdempotency?: boolean
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const CATEGORY_CONFIG: Record<string, { color: string; label: string; ring: string }> = {
  config: { color: "text-blue-400", label: "Config", ring: "ring-blue-500/30 bg-blue-500/10" },
  traffic: { color: "text-emerald-400", label: "Traffic", ring: "ring-emerald-500/30 bg-emerald-500/10" },
  troubleshoot: { color: "text-amber-400", label: "Troubleshoot", ring: "ring-amber-500/30 bg-amber-500/10" },
  management: { color: "text-violet-400", label: "Management", ring: "ring-violet-500/30 bg-violet-500/10" },
  payload: { color: "text-red-400", label: "Payload", ring: "ring-red-500/30 bg-red-500/10" },
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
  { name: "list_nodes", desc: "List infrastructure nodes", icon: Terminal },
  { name: "get_node", desc: "Get node details", icon: Terminal },
  { name: "create_node", desc: "Register a new node", icon: Terminal },
  { name: "update_node", desc: "Update node config", icon: Terminal },
  { name: "delete_node", desc: "Remove a node", icon: Trash2 },
  { name: "list_beacons", desc: "List active beacons", icon: Zap },
  { name: "get_beacon", desc: "Get beacon details", icon: Zap },
  { name: "deploy_node", desc: "Deploy node to cloud", icon: Wrench },
  { name: "list_deployments", desc: "List active deployments", icon: ListChecks },
  { name: "get_deployment_status", desc: "Check deployment progress", icon: CheckCircle2 },
  { name: "list_provider_presets", desc: "Cloud provider presets", icon: Info },
]

const DEFAULT_OP_GUIDE_CONTEXT: OpGuideContext = {
  primaryProfile: "node_setup",
  profiles: [
    { id: "node_setup", label: "Node Setup", detected: true, evidence: [] },
    { id: "beacon_build", label: "Beacon Build", detected: true, evidence: [] },
    { id: "deployment", label: "Deployment", detected: true, evidence: [] },
    { id: "post_exploit", label: "Post-Exploitation", detected: true, evidence: [] },
    { id: "monitoring", label: "Monitoring", detected: true, evidence: [] },
  ],
  env: {
    hysteriaConfigured: true,
    shadowGrokEnabled: true,
    mailConfigured: true,
    threatIntelConfigured: true,
  },
}

const OP_PROFILE_LABELS: Record<OpProfileId, string> = {
  node_setup: "Node Setup",
  beacon_build: "Beacon Build",
  deployment: "Deployment",
  post_exploit: "Post-Exploitation",
  monitoring: "Monitoring",
}

function opStrategyForProfile(profile: OpProfileId): string {
  switch (profile) {
    case "node_setup":
      return "Focus on Hysteria 2 node provisioning, traffic stats API configuration, and client config generation."
    case "beacon_build":
      return "Focus on implant compilation, packing (UPX), persistence configuration, and C2 node assignment."
    case "deployment":
      return "Focus on payload delivery methods: phishing campaigns, manual delivery, or redirector staging."
    case "post_exploit":
      return "Focus on credential harvesting, privilege escalation, lateral movement, and data exfiltration."
    case "monitoring":
      return "Focus on beacon health checks, node bandwidth monitoring, OPSEC scoring, and maintenance workflows."
    default:
      return "Focus on end-to-end C2 infrastructure management."
  }
}

function buildAdaptiveGuideSteps(
  _context: OpGuideContext,
  selectedProfile: OpProfileId,
): GuideStep[] {
  const profileLabel = OP_PROFILE_LABELS[selectedProfile]
  const strategy = opStrategyForProfile(selectedProfile)

  return [
    {
      id: "infra",
      title: "Provision Hysteria 2 Infrastructure on Azure",
      outcome: "Create and configure Azure-based C2/redirector nodes with monitoring.",
      prompt:
        `Step 1 — Provision Azure Infrastructure.\n` +
        `Profile: ${profileLabel}.\n` +
        `${strategy}\n` +
        `Execute:\n` +
        `1. Call list_profiles and list_nodes to inspect current infrastructure.\n` +
        `2. Call generate_config to create a stealth Hysteria 2 server YAML (obfuscated preset, port 443, masquerade, strong passwords).\n` +
        `   - Optionally include applyToNodes and sshPrivateKey to apply immediately via SSH.\n` +
        `3. Call deploy_node to provision a new Azure VPS with:\n` +
        `   - provider="azure" (required)\n` +
        `   - resourceGroup="hysteria-rg-eastus" (REQUIRED - must be an existing resource group)\n` +
        `   - region="eastus" (or westeurope, australiaeast)\n` +
        `   - name="hysteria-node-eastus-01" (descriptive name)\n` +
        `   Available resource groups: hysteria-rg-eastus, hysteria-rg-westeurope, hysteria-rg-australiaeast\n` +
        `4. Call get_deployment_status with the deploymentId to monitor progress.\n` +
        `5. Once deployment completes, call analyze_traffic to verify the new node reports health metrics.\n` +
        `Return the deployment ID, node ID, Azure region, VM name, public IP, and any auth credentials generated.`,
    },
    {
      id: "apply-config",
      title: "Apply Config to Existing Nodes",
      outcome: "Push Hysteria2 config to remote nodes via SSH (two methods).",
      prompt:
        `Step 2 — Apply Config via SSH.\n` +
        `Profile: ${profileLabel}.\n` +
        `${strategy}\n` +
        `Method A - Generate & Apply in One Step:\n` +
        `1. Call generate_config with applyToNodes=["node-id-1", "node-id-2"] and sshPrivateKey.\n` +
        `2. The config is generated AND pushed to nodes automatically, with service restart.\n` +
        `Method B - Apply Existing Profile:\n` +
        `1. Call list_profiles to select the config profile to apply.\n` +
        `2. Call list_nodes to identify target nodes with SSH credentials.\n` +
        `3. For each target node, call apply_node_config with: nodeId, profileId, sshPrivateKey, restartService=true.\n` +
        `4. Verify by calling get_node to confirm profileId was updated and status is healthy.\n` +
        `Return: which configs were applied, which nodes succeeded/failed, and service restart status.`,
    },
    {
      id: "beacon",
      title: "Build Beacon / Implant",
      outcome: "Compile and pack a stealth beacon for the target OS.",
      prompt:
        `Step 3 — Build Beacon.\n` +
        `Profile: ${profileLabel}.\n` +
        `${strategy}\n` +
        `Execute:\n` +
        `1. Call list_nodes to pick the best C2 node for callbacks (prefer online nodes with good latency).\n` +
        `2. Call generate_payload to build a Windows x64 beacon (UPX level 7, 45–90 min jitter, scheduled-task persistence, sandbox evasion, AMSI bypass).\n` +
        `3. Call get_payload_status with the build ID to confirm the build succeeded and get the download URL.\n` +
        `Return the beacon build ID, SHA-256 hash, and download link.`,
    },
    {
      id: "deploy",
      title: "Deploy Payload",
      outcome: "Deliver the beacon to target systems and confirm check-in.",
      prompt:
        `Step 4 — Deploy Payload.\n` +
        `Profile: ${profileLabel}.\n` +
        `${strategy}\n` +
        `Execute:\n` +
        `1. Call list_payloads to confirm the latest beacon build is ready for deployment.\n` +
        `2. Call analyze_traffic to check node health and bandwidth before delivery.\n` +
        `3. Call get_node to retrieve the target node’s subscription/config URL for redirector staging.\n` +
        `4. Call list_beacons after delivery window to check for new check-ins.\n` +
        `Return the delivery method chosen (phishing / manual / redirector), staging URLs, and check-in status.`,
    },
    {
      id: "c2",
      title: "Beacon Monitoring & C2 Operations",
      outcome: "Maintain situational awareness and manage active beacons.",
      prompt:
        `Step 5 — Active C2.\n` +
        `Profile: ${profileLabel}.\n` +
        `${strategy}\n` +
        `Execute:\n` +
        `1. Call list_beacons to enumerate all active implants and filter by online status.\n` +
        `2. For each online beacon, call get_beacon with the beacon ID to pull host info, last check-in, and metadata.\n` +
        `3. Call troubleshoot to run connectivity and OPSEC diagnostics on any stale or unresponsive beacons.\n` +
        `4. If any beacons are unresponsive, call analyze_traffic on their assigned C2 node to inspect server-side logs.\n` +
        `Return a status table: beacon ID, hostname, OS, IP, last seen, and recommended next action.`,
    },
    {
      id: "maintain",
      title: "Monitor, Maintain & Clean Up",
      outcome: "Keep infrastructure healthy and execute safe operational teardown.",
      prompt:
        `Step 6 — Maintenance & Cleanup.\n` +
        `Profile: ${profileLabel}.\n` +
        `${strategy}\n` +
        `Execute:\n` +
        `1. Call list_nodes and analyze_traffic to audit node bandwidth, connections, and health status.\n` +
        `2. Call list_beacons and get_beacon to review beacon activity and identify stale implants.\n` +
        `3. For nodes needing config updates, call update_node to rotate auth credentials or change settings.\n` +
        `4. Call apply_node_config to push updated configs to remote nodes via SSH (with restartService=true).\n` +
        `5. Call delete_payload to purge old build artifacts and reduce disk usage.\n` +
        `6. For retired beacons, use delete_node to remove unused C2 nodes (ensure no active beacons first).\n` +
        `Return a maintenance report: nodes audited, configs updated, beacons reviewed, artifacts removed.`,
    },
  ]
}

/* Relative time formatter for conversation list grouping. */
function relativeTime(ts: number) {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function dateBucket(ts: number): "today" | "yesterday" | "week" | "older" {
  const now = new Date()
  const d = new Date(ts)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 86_400_000
  const startWeek = startToday - 6 * 86_400_000
  if (d.getTime() >= startToday) return "today"
  if (d.getTime() >= startYesterday) return "yesterday"
  if (d.getTime() >= startWeek) return "week"
  return "older"
}

const BUCKET_LABELS: Record<"today" | "yesterday" | "week" | "older", string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  older: "Older",
}

/* Last assistant message snippet for conversation preview. */
function previewSnippet(conv: Conversation): string {
  const last = [...conv.messages].reverse().find((m) => (m.content ?? "").trim().length > 0)
  if (!last?.content) return "No messages yet"
  const text = last.content.replace(/\s+/g, " ").trim()
  return text.length > 80 ? text.slice(0, 80) + "…" : text
}

function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `msg-${crypto.randomUUID()}`
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "recent" | "with-tools" | "tag">("all")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [editingTagsForId, setEditingTagsForId] = useState<string | null>(null)
  const [newTag, setNewTag] = useState("")
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showConversations, setShowConversations] = useState(true)
  const [showResources, setShowResources] = useState(false)
  const [resourcesTab, setResourcesTab] = useState<"templates" | "tools" | "stats" | "guide">(
    "templates",
  )
  const [opGuideContext, setOpGuideContext] = useState<OpGuideContext>(
    DEFAULT_OP_GUIDE_CONTEXT,
  )
  const [opGuideLoading, setOpGuideLoading] = useState(false)
  const [selectedOpProfile, setSelectedOpProfile] = useState<OpProfileId>(
    DEFAULT_OP_GUIDE_CONTEXT.primaryProfile,
  )
  const [messagesPage, setMessagesPage] = useState(1)
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([])
  const [currentProgressIndex, setCurrentProgressIndex] = useState(0)
  const MESSAGES_PER_PAGE = 20
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const lastRetryRef = useRef<{ prompt: string; clientMessageId: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  /* ---- Filter conversations ---- */
  const filteredConversations = conversations
    .filter((conv) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = conv.title.toLowerCase().includes(query)
        const matchesMessages = conv.messages.some((msg) =>
          msg.content?.toLowerCase().includes(query),
        )
        if (!matchesTitle && !matchesMessages) return false
      }
      if (filterType === "recent") {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        if (conv.updatedAt < oneWeekAgo) return false
      } else if (filterType === "with-tools") {
        const hasTools = conv.messages.some((msg) => msg.toolCalls && msg.toolCalls.length > 0)
        if (!hasTools) return false
      } else if (filterType === "tag" && selectedTag) {
        if (!conv.tags.includes(selectedTag)) return false
      }
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)

  /* ---- Group conversations by date bucket ---- */
  const groupedConversations = useMemo(() => {
    const groups: Record<"today" | "yesterday" | "week" | "older", Conversation[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    }
    for (const conv of filteredConversations) {
      groups[dateBucket(conv.updatedAt)].push(conv)
    }
    return groups
  }, [filteredConversations])

  /* ---- Get all unique tags ---- */
  const allTags = [...new Set(conversations.flatMap((c) => c.tags))].sort()

  /* ---- Add tag to conversation ---- */
  const addTag = async (conversationId: string, tag: string) => {
    if (!tag.trim()) return
    const conv = conversations.find((c) => c.id === conversationId)
    if (!conv) return

    const updatedTags = [...new Set([...conv.tags, tag.trim()])]
    try {
      const res = await apiFetch("/api/admin/ai/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, tags: updatedTags }),
      })
      if (res.ok) {
        await res.json()
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, tags: updatedTags } : c)),
        )
        toast.success("Tag added")
      } else {
        throw new Error("Tag update failed")
      }
    } catch {
      toast.error("Failed to add tag")
    }
  }

  /* ---- Remove tag from conversation ---- */
  const removeTag = async (conversationId: string, tag: string) => {
    const conv = conversations.find((c) => c.id === conversationId)
    if (!conv) return

    const updatedTags = conv.tags.filter((t) => t !== tag)
    try {
      const res = await apiFetch("/api/admin/ai/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, tags: updatedTags }),
      })
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, tags: updatedTags } : c)),
        )
        toast.success("Tag removed")
      } else {
        throw new Error("Tag update failed")
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

  const loadInitialData = useCallback(async () => {
    setSidebarLoading(true)
    setInitError(null)
    const [convRes, tmplRes] = await Promise.allSettled([
      apiFetch("/api/admin/ai/conversations"),
      apiFetch("/api/admin/ai/templates"),
    ])

    if (convRes.status === "fulfilled" && convRes.value.ok) {
      const data = await convRes.value.json()
      const fetchedConversations = (data.conversations ?? []) as Conversation[]
      setConversations(fetchedConversations)

      const savedActiveId = sessionStorage.getItem("ai-active-conversation-id")
      if (savedActiveId) {
        const cached = fetchedConversations.find((c) => c.id === savedActiveId)
        if (cached) {
          setActiveId(savedActiveId)
          setMessages(cached.messages)
          void apiFetch(`/api/admin/ai/conversations/${savedActiveId}`)
            .then(async (res) => {
              if (!res.ok) return
              const payload = await res.json()
              const canonical = payload.conversation as Conversation
              setConversations((prev) => {
                const others = prev.filter((c) => c.id !== canonical.id)
                return [canonical, ...others]
              })
              setMessages(canonical.messages ?? [])
            })
            .catch(() => {
              /* keep cached restore data */
            })
        }
      }
    } else {
      setInitError("Failed to load conversations")
    }

    if (tmplRes.status === "fulfilled" && tmplRes.value.ok) {
      const data = await tmplRes.value.json()
      setTemplates(data.templates ?? [])
    } else {
      setInitError((prev) => prev ?? "Failed to load templates")
    }

    setSidebarLoading(false)
  }, [])

  /* ---- Load conversations + templates on mount ---- */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitialData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadInitialData])

  /* ---- Detect operational profile for adaptive guide ---- */
  useEffect(() => {
    const loadGuideContext = async () => {
      setOpGuideLoading(true)
      try {
        const res = await apiFetch("/api/admin/ai/deploy-profile")
        if (!res.ok) return
        const data = (await res.json()) as Partial<OpGuideContext>
        if (!data || !data.primaryProfile || !data.profiles) return
        setOpGuideContext({
          primaryProfile: data.primaryProfile,
          profiles: data.profiles,
          env: data.env ?? DEFAULT_OP_GUIDE_CONTEXT.env,
        })
        setSelectedOpProfile(data.primaryProfile)
      } catch {
        /* keep defaults */
      } finally {
        setOpGuideLoading(false)
      }
    }
    loadGuideContext()
  }, [])

  /* ---- Select conversation ---- */
  const selectConversation = useCallback(
    async (id: string) => {
      setActiveId(id)
      sessionStorage.setItem("ai-active-conversation-id", id)
      setMessagesPage(1)
      setMessagesLoading(true)
      setSendError(null)
      const cached = conversations.find((c) => c.id === id)
      if (cached) {
        setMessages(cached.messages)
        setMessagesLoading(false)
        setTimeout(scrollToBottom, 100)
        return
      }
      try {
        const res = await apiFetch(`/api/admin/ai/conversations/${id}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.conversation.messages ?? [])
          setTimeout(scrollToBottom, 100)
        } else {
          const err = await res.json().catch(() => ({ error: `${res.status}` }))
          setSendError(err.error ?? "Failed to load conversation")
        }
      } catch {
        setSendError("Failed to load conversation")
      } finally {
        setMessagesLoading(false)
      }
    },
    [conversations, scrollToBottom],
  )

  const refreshConversationFromServer = useCallback(
    async (conversationId: string) => {
      const res = await apiFetch(`/api/admin/ai/conversations/${conversationId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${res.status}` }))
        throw new Error(err.error ?? "Failed to refresh conversation")
      }
      const data = await res.json()
      const conversation = data.conversation as Conversation

      setConversations((prev) => {
        const others = prev.filter((c) => c.id !== conversation.id)
        return [conversation, ...others]
      })
      if (activeId === conversationId) {
        setMessages(conversation.messages ?? [])
      }
    },
    [activeId],
  )

  /* ---- Paginated messages ---- */
  const paginatedMessages = messages.slice(0, messagesPage * MESSAGES_PER_PAGE)
  const hasMoreMessages = messages.length > paginatedMessages.length

  const loadMoreMessages = () => {
    setMessagesPage((prev) => prev + 1)
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
        sessionStorage.setItem("ai-active-conversation-id", conv.id)
        setMessages([])
        setSendError(null)
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
        const res = await apiFetch(`/api/admin/ai/conversations/${id}`, { method: "DELETE" })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }))
          throw new Error(err.error ?? "Delete failed")
        }
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
          sessionStorage.removeItem("ai-active-conversation-id")
        }
        toast.success("Conversation deleted")
      } catch {
        toast.error("Failed to delete conversation")
      }
    },
    [activeId],
  )

  /* ---- Send message ---- */
  async function sendMessage(
    prompt: string,
    options?: { clientMessageId?: string },
  ): Promise<void> {
    if (!prompt.trim() || loading) return

    setProgressEvents([])
    setCurrentProgressIndex(0)
    setSendError(null)

    let convId = activeId
    if (!convId) {
      convId = await createConversation()
      if (!convId) return
    }

    const clientMessageId = options?.clientMessageId ?? createClientMessageId()
    const userMsg: ChatMessage = {
      role: "user",
      content: prompt.trim(),
      timestamp: Date.now(),
      clientMessageId,
      pending: true,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    setLoading(true)
    setTimeout(scrollToBottom, 100)

    abortControllerRef.current = new AbortController()

    try {
      const res = await apiFetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          message: prompt.trim(),
          clientMessageId,
        }),
        signal: abortControllerRef.current.signal,
      })

      const data = (await res.json().catch(() => ({}))) as ChatApiResponse
      const progress = data.progress ?? []
      setProgressEvents(progress)

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      await refreshConversationFromServer(convId).catch(() => {
        const newMsgs = data.messages ?? []
        setMessages((prev) => [
          ...prev.filter((m) => m.clientMessageId !== clientMessageId),
          ...newMsgs,
        ])
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, updatedAt: Date.now(), messages: [...c.messages, ...newMsgs] }
              : c,
          ),
        )
      })

      lastRetryRef.current = null
      setTimeout(scrollToBottom, 100)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User clicked stop — keep the user message, just clear pending state
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, pending: false } : m)),
        )
        return
      }

      const errorMessage = err instanceof Error ? err.message : "Request failed"
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId))
      setSendError(errorMessage)
      lastRetryRef.current = { prompt: prompt.trim(), clientMessageId }
      toast.error("AI request failed", {
        description: errorMessage,
        action: {
          label: "Retry",
          onClick: () => {
            void sendMessage(prompt.trim(), { clientMessageId })
          },
        },
      })
    } finally {
      abortControllerRef.current = null
      setLoading(false)
    }
  }

  /* ---- Stop generation ---- */
  function stopGeneration() {
    abortControllerRef.current?.abort()
  }

  /* ---- Copy helper ---- */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  /* ---- Export conversation ---- */
  const exportConversation = (format: "json" | "markdown" | "txt") => {
    if (!activeId) return

    const conv = conversations.find((c) => c.id === activeId)
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
        const role =
          msg.role === "user"
            ? "User"
            : msg.role === "assistant"
              ? "Assistant"
              : msg.role === "tool"
                ? "Tool"
                : "System"
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
        const role =
          msg.role === "user"
            ? "USER"
            : msg.role === "assistant"
              ? "ASSISTANT"
              : msg.role === "tool"
                ? "TOOL"
                : "SYSTEM"
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

  /* ---- Template categories & pinned suggestions ---- */
  const categories = [...new Set(templates.map((t) => t.category))]
  const pinnedSuggestions = useMemo(() => {
    /* Surface 6 prompts: one per category, plus filler. */
    const seen = new Set<string>()
    const result: Template[] = []
    for (const t of templates) {
      if (!seen.has(t.category)) {
        seen.add(t.category)
        result.push(t)
        if (result.length >= 6) break
      }
    }
    let i = 0
    while (result.length < 6 && i < templates.length) {
      if (!result.includes(templates[i])) result.push(templates[i])
      i++
    }
    return result
  }, [templates])

  const adaptiveGuideSteps = useMemo(
    () => buildAdaptiveGuideSteps(opGuideContext, selectedOpProfile),
    [opGuideContext, selectedOpProfile],
  )

  /* ---- Tool usage analytics ---- */
  const toolUsageStats = useMemo(() => {
    const toolCounts: Record<string, number> = {}
    let totalToolCalls = 0
    let successfulToolCalls = 0

    conversations.forEach((conv) => {
      conv.messages.forEach((msg) => {
        if (msg.toolCalls) {
          msg.toolCalls.forEach((tc) => {
            toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1
            totalToolCalls++
          })
        }
        if (msg.role === "tool" && msg.toolResult) {
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
      successRate:
        totalToolCalls > 0 ? Math.round((successfulToolCalls / totalToolCalls) * 100) : 100,
      topTools: sortedTools,
    }
  }, [conversations])

  /* ---- Animate progress events ---- */
  useEffect(() => {
    if (progressEvents.length > 0 && currentProgressIndex < progressEvents.length) {
      const timer = setTimeout(() => {
        setCurrentProgressIndex((prev) => prev + 1)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [progressEvents, currentProgressIndex])

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault()
        createConversation()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault()
        setShowShortcuts((prev) => !prev)
      }
      if (e.key === "Escape") {
        if (showShortcuts) setShowShortcuts(false)
        if (editingTagsForId) setEditingTagsForId(null)
        if (activeId) textareaRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showShortcuts, editingTagsForId, activeId, createConversation])

  const activeConv = activeId ? conversations.find((c) => c.id === activeId) : null

  return (
    <div className="flex flex-col gap-4">
      {!hideHeader && (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-heading-xl">AI Assistant</h1>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Multi-tool agent for config generation, traffic analysis, troubleshooting, payload
              creation, and infrastructure management.
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

      <div
        className={cn(
          "grid gap-4 transition-all",
          showConversations && showResources && "lg:grid-cols-[280px_1fr_300px]",
          showConversations && !showResources && "lg:grid-cols-[280px_1fr]",
          !showConversations && showResources && "lg:grid-cols-[1fr_300px]",
          !showConversations && !showResources && "grid-cols-1",
        )}
        style={{ minHeight: hideHeader ? "calc(100vh - 220px)" : "calc(100vh - 180px)" }}
      >
        {/* ---- Left rail: Conversations ---- */}
        {showConversations && (
          <ConversationsRail
            sidebarLoading={sidebarLoading}
            createConversation={createConversation}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterType={filterType}
            setFilterType={setFilterType}
            allTags={allTags}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            groupedConversations={groupedConversations}
            activeId={activeId}
            selectConversation={selectConversation}
            deleteConversation={deleteConversation}
            editingTagsForId={editingTagsForId}
            setEditingTagsForId={setEditingTagsForId}
            newTag={newTag}
            setNewTag={setNewTag}
            addTag={addTag}
            removeTag={removeTag}
            totalCount={conversations.length}
          />
        )}

        {/* ---- Center: Chat surface ---- */}
        <Card className="flex flex-col overflow-hidden border-border/60 shadow-sm">
          {/* Sub-header with conversation context + rail toggles */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 shrink-0",
                        showConversations && "bg-primary/10 text-primary",
                      )}
                      onClick={() => setShowConversations((v) => !v)}
                    />
                  }
                >
                  <PanelLeft className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle conversations</TooltipContent>
              </Tooltip>

              <div className="hidden h-5 w-px bg-border/60 sm:block" />

              <div className="min-w-0 flex-1">
                {activeConv ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <Bot className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-body-sm font-medium text-foreground">
                      {activeConv.title}
                    </span>
                    {activeConv.tags.length > 0 && (
                      <div className="ml-1 hidden items-center gap-1 sm:flex">
                        {activeConv.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-micro text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                        {activeConv.tags.length > 2 && (
                          <span className="text-micro text-muted-foreground/60">
                            +{activeConv.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-body-sm text-muted-foreground">
                    No conversation selected
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {activeConv && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hidden gap-1 px-2 text-micro text-muted-foreground hover:text-foreground sm:inline-flex"
                      >
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
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8",
                        showResources && "bg-primary/10 text-primary",
                      )}
                      onClick={() => setShowResources((v) => !v)}
                    />
                  }
                >
                  <PanelRight className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle templates &amp; tools</TooltipContent>
              </Tooltip>
              {hideHeader && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowShortcuts(true)}
                      />
                    }
                  >
                    <Keyboard className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Keyboard shortcuts</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="space-y-4 px-4 py-5 sm:px-6">
              {initError && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
                  <span>{initError}</span>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => void loadInitialData()}>
                    Retry load
                  </Button>
                </div>
              )}
              {sendError && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning-foreground">
                  <span className="text-warning">{sendError}</span>
                  {lastRetryRef.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        const retry = lastRetryRef.current
                        if (!retry) return
                        void sendMessage(retry.prompt, { clientMessageId: retry.clientMessageId })
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
              {messagesLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-body-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading conversation…
                </div>
              ) : !activeId ? (
                <ChatHero
                  onCreate={createConversation}
                  pinned={pinnedSuggestions}
                  loading={loading}
                  onOpenGuide={() => {
                    setResourcesTab("guide")
                    setShowResources(true)
                  }}
                  sendMessage={sendMessage}
                />
              ) : messages.length === 0 ? (
                <FreshConversationPrompt
                  pinned={pinnedSuggestions}
                  loading={loading}
                  sendMessage={sendMessage}
                  onOpenGuide={() => {
                    setResourcesTab("guide")
                    setShowResources(true)
                  }}
                  onOpenResources={() => setShowResources(true)}
                />
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
                      key={msg.clientMessageId ?? `${msg.timestamp}-${i}`}
                      msg={msg}
                      onCopy={copyToClipboard}
                    />
                  ))}
                </>
              )}
              {loading && (
                <ProgressBubble
                  events={progressEvents}
                  currentIndex={currentProgressIndex}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="shrink-0 border-t border-border/60 bg-card/80 p-3 sm:p-4">
            <div className="relative">
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
                    void sendMessage(input)
                  }
                }}
                placeholder={
                  activeId
                    ? "Ask about your Hysteria2 infrastructure…"
                    : "Type a message to start a new conversation…"
                }
                rows={1}
                disabled={loading}
                className="w-full resize-none rounded-xl border border-border/60 bg-background/60 py-3 pl-4 pr-14 text-body-sm leading-relaxed shadow-inner transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              {loading ? (
                <Button
                  onClick={stopGeneration}
                  size="icon"
                  className="absolute bottom-2 right-2 h-9 w-9 rounded-lg bg-destructive shadow-md shadow-destructive/20 hover:bg-destructive/90"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim()}
                  size="icon"
                  className="absolute bottom-2 right-2 h-9 w-9 rounded-lg bg-primary shadow-md shadow-primary/20 hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-micro text-muted-foreground/70">
              <span>
                <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>{" "}
                send ·{" "}
                <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                  Shift+Enter
                </kbd>{" "}
                newline
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <Wrench className="h-3 w-3" />
                10 tools available
              </span>
            </div>
          </div>
        </Card>

        {/* ---- Right rail: Resources ---- */}
        {showResources && (
          <ResourcesRail
            templates={templates}
            categories={categories}
            sendMessage={sendMessage}
            loading={loading}
            toolUsageStats={toolUsageStats}
            guideSteps={adaptiveGuideSteps}
            guideProfiles={opGuideContext.profiles}
            activeGuideProfile={selectedOpProfile}
            onGuideProfileChange={setSelectedOpProfile}
            guideLoading={opGuideLoading}
            activeTab={resourcesTab}
            onTabChange={(tab) => setResourcesTab(tab)}
            onClose={() => setShowResources(false)}
          />
        )}
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
          <div className="space-y-2 py-2">
            {[
              ["Focus search", ["⌘", "K"]],
              ["New conversation", ["⌘", "N"]],
              ["Show shortcuts", ["⌘", "/"]],
              ["Send message", ["Enter"]],
              ["New line", ["Shift", "Enter"]],
              ["Close / Escape", ["Esc"]],
            ].map(([label, keys]) => (
              <div
                key={label as string}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/40"
              >
                <span className="text-body-sm">{label}</span>
                <div className="flex items-center gap-1">
                  {(keys as string[]).map((k, idx, arr) => (
                    <span key={idx} className="flex items-center gap-1">
                      <kbd className="rounded border border-border/60 bg-muted px-2 py-1 font-mono text-micro">
                        {k}
                      </kbd>
                      {idx < arr.length - 1 && (
                        <span className="text-micro text-muted-foreground/40">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Conversations Rail                                                */
/* ------------------------------------------------------------------ */

type ConversationsRailProps = {
  sidebarLoading: boolean
  createConversation: () => Promise<string | null>
  searchInputRef: React.RefObject<HTMLInputElement | null>
  searchQuery: string
  setSearchQuery: (s: string) => void
  filterType: "all" | "recent" | "with-tools" | "tag"
  setFilterType: (f: "all" | "recent" | "with-tools" | "tag") => void
  allTags: string[]
  selectedTag: string | null
  setSelectedTag: (t: string | null) => void
  groupedConversations: Record<"today" | "yesterday" | "week" | "older", Conversation[]>
  activeId: string | null
  selectConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  editingTagsForId: string | null
  setEditingTagsForId: (id: string | null) => void
  newTag: string
  setNewTag: (s: string) => void
  addTag: (id: string, tag: string) => Promise<void>
  removeTag: (id: string, tag: string) => Promise<void>
  totalCount: number
}

function ConversationsRail(props: ConversationsRailProps) {
  const {
    sidebarLoading,
    createConversation,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    allTags,
    selectedTag,
    setSelectedTag,
    groupedConversations,
    activeId,
    selectConversation,
    deleteConversation,
    editingTagsForId,
    setEditingTagsForId,
    newTag,
    setNewTag,
    addTag,
    removeTag,
    totalCount,
  } = props

  const totalFiltered =
    groupedConversations.today.length +
    groupedConversations.yesterday.length +
    groupedConversations.week.length +
    groupedConversations.older.length

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={createConversation}
        size="sm"
        className="w-full justify-center gap-2 bg-primary shadow-md shadow-primary/20 hover:bg-primary/90"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        New Conversation
      </Button>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search conversations…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-background/50 py-2 pl-8 pr-8 text-body-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
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

        <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/40 bg-muted/30 p-0.5">
          {(["all", "recent", "with-tools", "tag"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={cn(
                "rounded-md px-2 py-1 text-micro font-medium transition-all",
                filterType === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "with-tools" ? "Tools" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filterType === "tag" && allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-micro transition-colors",
                  selectedTag === tag
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-2">
            {sidebarLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : totalFiltered === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-caption text-muted-foreground">
                  {searchQuery
                    ? "No conversations found"
                    : totalCount === 0
                      ? "No conversations yet"
                      : "No matches for this filter"}
                </p>
                <p className="text-micro text-muted-foreground/60">
                  {searchQuery
                    ? "Try a different search term"
                    : totalCount === 0
                      ? "Start one above to begin"
                      : "Try a different filter"}
                </p>
              </div>
            ) : (
              (Object.keys(BUCKET_LABELS) as Array<keyof typeof BUCKET_LABELS>).map((bucket) => {
                const items = groupedConversations[bucket]
                if (items.length === 0) return null
                return (
                  <div key={bucket} className="space-y-1">
                    <div className="px-2 pt-1 text-label text-muted-foreground/70">
                      {BUCKET_LABELS[bucket]}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((conv) => (
                        <ConversationRow
                          key={conv.id}
                          conv={conv}
                          active={activeId === conv.id}
                          onSelect={() => selectConversation(conv.id)}
                          onDelete={() => deleteConversation(conv.id)}
                          isEditingTags={editingTagsForId === conv.id}
                          onToggleEditTags={(open) =>
                            setEditingTagsForId(open ? conv.id : null)
                          }
                          newTag={newTag}
                          setNewTag={setNewTag}
                          onAddTag={(t) => addTag(conv.id, t)}
                          onRemoveTag={(t) => removeTag(conv.id, t)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function ConversationRow({
  conv,
  active,
  onSelect,
  onDelete,
  isEditingTags,
  onToggleEditTags,
  newTag,
  setNewTag,
  onAddTag,
  onRemoveTag,
}: {
  conv: Conversation
  active: boolean
  onSelect: () => void
  onDelete: () => void
  isEditingTags: boolean
  onToggleEditTags: (open: boolean) => void
  newTag: string
  setNewTag: (s: string) => void
  onAddTag: (t: string) => Promise<void>
  onRemoveTag: (t: string) => Promise<void>
}) {
  const snippet = previewSnippet(conv)
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-lg px-3 py-2 transition-all",
        active
          ? "bg-primary/10 ring-1 ring-primary/30"
          : "border border-transparent hover:border-border/40 hover:bg-muted/40",
      )}
    >
      {active && (
        <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-r-full bg-primary" />
      )}
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
            active ? "bg-primary/20" : "bg-muted",
          )}
        >
          <Bot className={cn("h-3 w-3", active ? "text-primary" : "text-muted-foreground/60")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-body-sm font-medium",
                active ? "text-foreground" : "text-foreground/90",
              )}
            >
              {conv.title}
            </span>
            <span className="shrink-0 text-micro text-muted-foreground/60">
              {relativeTime(conv.updatedAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-micro text-muted-foreground/70">{snippet}</p>
          {conv.tags.length > 0 && !isEditingTags && (
            <div className="mt-1 flex flex-wrap gap-1">
              {conv.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted/70 px-1.5 py-0 text-[10px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {conv.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground/60">
                  +{conv.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleEditTags(!isEditingTags)
                }}
                className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              />
            }
          >
            <Tag className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="left">Edit tags</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              />
            }
          >
            <Trash2 className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="left">Delete</TooltipContent>
        </Tooltip>
      </div>

      {isEditingTags && (
        <div
          className="mt-2 space-y-1.5 rounded-md border border-border/40 bg-background/50 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            placeholder="Add tag…"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                e.preventDefault()
                onAddTag(newTag)
                setNewTag("")
              }
            }}
            className="w-full rounded border border-border/40 bg-background/70 px-2 py-1 text-micro focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {conv.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conv.tags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-micro text-primary"
                >
                  {tag}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveTag(tag)
                    }}
                    className="hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Resources Rail (Templates, Tools, Stats)                          */
/* ------------------------------------------------------------------ */

function ResourcesRail({
  templates,
  categories,
  sendMessage,
  loading,
  toolUsageStats,
  guideSteps,
  guideProfiles,
  activeGuideProfile,
  onGuideProfileChange,
  guideLoading,
  activeTab,
  onTabChange,
  onClose,
}: {
  templates: Template[]
  categories: string[]
  sendMessage: (prompt: string) => Promise<void>
  loading: boolean
  toolUsageStats: {
    totalToolCalls: number
    successfulToolCalls: number
    successRate: number
    topTools: { name: string; count: number }[]
  }
  guideSteps: GuideStep[]
  guideProfiles: OpProfileSignal[]
  activeGuideProfile: OpProfileId
  onGuideProfileChange: (profile: OpProfileId) => void
  guideLoading: boolean
  activeTab: "templates" | "tools" | "stats" | "guide"
  onTabChange: (tab: "templates" | "tools" | "stats" | "guide") => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex-1 overflow-hidden border-border/60 shadow-sm">
        <CardContent className="flex h-full flex-col p-0">
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as typeof activeTab)} className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <TabsList className="h-auto gap-0.5 bg-muted/40 p-0.5">
                <TabsTrigger
                  value="guide"
                  className="gap-1.5 px-2.5 py-1 text-micro data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <ListChecks className="h-3 w-3" />
                  Guide
                </TabsTrigger>
                <TabsTrigger
                  value="templates"
                  className="gap-1.5 px-2.5 py-1 text-micro data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Sparkles className="h-3 w-3" />
                  Templates
                </TabsTrigger>
                <TabsTrigger
                  value="tools"
                  className="gap-1.5 px-2.5 py-1 text-micro data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Wrench className="h-3 w-3" />
                  Tools
                </TabsTrigger>
                <TabsTrigger
                  value="stats"
                  className="gap-1.5 px-2.5 py-1 text-micro data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <BarChart3 className="h-3 w-3" />
                  Stats
                </TabsTrigger>
              </TabsList>
              <button
                onClick={onClose}
                className="rounded p-1 text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <TabsContent value="guide" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <BuildDeployGuide
                  steps={guideSteps}
                  profiles={guideProfiles}
                  activeProfile={activeGuideProfile}
                  onChangeProfile={onGuideProfileChange}
                  sendMessage={sendMessage}
                  loading={loading}
                  profileLoading={guideLoading}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="templates" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  {categories.length === 0 ? (
                    <div className="py-8 text-center text-caption text-muted-foreground">
                      No templates available
                    </div>
                  ) : (
                    categories.map((cat) => {
                      const conf = CATEGORY_CONFIG[cat] ?? {
                        color: "text-foreground",
                        label: cat,
                        ring: "ring-border/40 bg-muted",
                      }
                      const items = templates.filter((t) => t.category === cat)
                      if (items.length === 0) return null
                      return (
                        <div key={cat} className="space-y-1.5">
                          <div className="flex items-center gap-2 px-1">
                            <div
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded ring-1",
                                conf.ring,
                              )}
                            >
                              <Sparkles className={cn("h-3 w-3", conf.color)} />
                            </div>
                            <span className="text-label text-muted-foreground/70">
                              {conf.label}
                            </span>
                            <span className="text-micro text-muted-foreground/60">
                              {items.length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {items.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => void sendMessage(t.prompt)}
                                disabled={loading}
                                className="group block w-full rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-body-sm font-medium text-foreground/90 group-hover:text-primary">
                                    {t.label}
                                  </span>
                                  {cat === "payload" && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 border-destructive/30 bg-destructive/10 px-1 text-[10px] text-destructive"
                                    >
                                      Risk
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-micro text-muted-foreground">
                                  {t.description}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="tools" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-1 p-3">
                  {TOOLS_LIST.map((tool) => {
                    const Icon = tool.icon
                    return (
                      <div
                        key={tool.name}
                        className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/20">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <code className="block truncate font-mono text-micro text-foreground/90 group-hover:text-primary">
                            {tool.name}
                          </code>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {tool.desc}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="stats" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <StatPill
                      label="Total calls"
                      value={toolUsageStats.totalToolCalls.toString()}
                      hint="Tool invocations"
                    />
                    <StatPill
                      label="Success rate"
                      value={`${toolUsageStats.successRate}%`}
                      hint="Completed cleanly"
                      tone={
                        toolUsageStats.successRate >= 90
                          ? "success"
                          : toolUsageStats.successRate >= 70
                            ? "warning"
                            : "danger"
                      }
                    />
                  </div>

                  <div className="space-y-2 rounded-lg border border-border/40 bg-background/40 p-3">
                    <div className="flex items-center gap-2">
                      <History className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-label text-muted-foreground/70">Top tools</span>
                    </div>
                    {toolUsageStats.topTools.length === 0 ? (
                      <p className="py-3 text-center text-micro text-muted-foreground/60">
                        No tool usage recorded yet
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {toolUsageStats.topTools.map((tool, i) => {
                          const max = toolUsageStats.topTools[0]?.count || 1
                          const pct = Math.round((tool.count / max) * 100)
                          return (
                            <div key={tool.name} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] text-primary">
                                    {i + 1}
                                  </span>
                                  <code className="truncate font-mono text-micro text-foreground/90">
                                    {tool.name}
                                  </code>
                                </div>
                                <span className="text-micro tabular-nums text-muted-foreground">
                                  {tool.count}
                                </span>
                              </div>
                              <div className="h-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-primary/70 transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function StatPill({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: string
  hint?: string
  tone?: "default" | "success" | "warning" | "danger"
}) {
  const toneColor = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone]
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className={cn("mt-0.5 text-heading-md tabular-nums", toneColor)}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/60">{hint}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Hero (no conversation selected)                                   */
/* ------------------------------------------------------------------ */

function ChatHero({
  onCreate,
  pinned,
  loading,
  onOpenGuide,
  sendMessage,
}: {
  onCreate: () => Promise<string | null>
  pinned: Template[]
  loading: boolean
  onOpenGuide: () => void
  sendMessage: (prompt: string) => Promise<void>
}) {
  return (
    <div className="relative mx-auto flex max-w-2xl flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 ring-1 ring-primary/30">
          <Sparkles className="h-9 w-9 text-primary glow-primary" />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-heading-lg">How can I help today?</h3>
        <p className="max-w-md text-body-sm text-muted-foreground">
          Pick a starter prompt or begin a new conversation. The assistant has access to 10 tools
          for config, traffic, troubleshooting, and payload operations.
        </p>
      </div>

      {pinned.length > 0 && (
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {pinned.slice(0, 6).map((t) => {
            const conf = CATEGORY_CONFIG[t.category] ?? {
              color: "text-foreground",
              label: t.category,
              ring: "ring-border/40 bg-muted",
            }
            return (
              <button
                key={t.id}
                disabled={loading}
                onClick={() => void sendMessage(t.prompt)}
                className="group flex items-start gap-2.5 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
                    conf.ring,
                  )}
                >
                  <Sparkles className={cn("h-3.5 w-3.5", conf.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium text-foreground group-hover:text-primary">
                    {t.label}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-micro text-muted-foreground">
                    {t.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Button
        onClick={onCreate}
        disabled={loading}
        className="gap-2 bg-primary shadow-md shadow-primary/20 hover:bg-primary/90"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Start Blank Conversation
      </Button>

      <Button
        variant="outline"
        onClick={onOpenGuide}
        disabled={loading}
        className="gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
      >
        <ListChecks className="h-4 w-4 text-primary" />
        Open Build &amp; Deploy Guide
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Fresh conversation prompt panel (active conv, no messages)        */
/* ------------------------------------------------------------------ */

function FreshConversationPrompt({
  pinned,
  loading,
  sendMessage,
  onOpenGuide,
  onOpenResources,
}: {
  pinned: Template[]
  loading: boolean
  sendMessage: (prompt: string) => Promise<void>
  onOpenGuide: () => void
  onOpenResources: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 ring-1 ring-border/40">
        <Bot className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div>
        <h3 className="text-heading-md">Ready for instructions</h3>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Type a prompt below or pick a starter below to begin.
        </p>
      </div>
      {pinned.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {pinned.slice(0, 5).map((t) => (
            <button
              key={t.id}
              disabled={loading}
              onClick={() => void sendMessage(t.prompt)}
              className="rounded-full border border-border/50 bg-card px-3 py-1.5 text-micro text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border/50 disabled:hover:bg-card disabled:hover:text-muted-foreground"
            >
              {t.label}
            </button>
          ))}
          <button
            disabled={loading}
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-micro text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ListChecks className="h-3 w-3" />
            Build &amp; Deploy Guide
          </button>
          <button
            disabled={loading}
            onClick={onOpenResources}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-3 py-1.5 text-micro text-muted-foreground hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            More
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Build & Deploy Guide                                              */
/* ------------------------------------------------------------------ */

function BuildDeployGuide({
  steps,
  profiles,
  activeProfile,
  onChangeProfile,
  sendMessage,
  loading,
  profileLoading,
}: {
  steps: GuideStep[]
  profiles: OpProfileSignal[]
  activeProfile: OpProfileId
  onChangeProfile: (profile: OpProfileId) => void
  sendMessage: (prompt: string) => Promise<void>
  loading: boolean
  profileLoading: boolean
}) {
  const activeProfileLabel = OP_PROFILE_LABELS[activeProfile]

  return (
    <div className="space-y-2.5 p-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
            <ListChecks className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-body-sm font-medium">Step-by-step operational guide</p>
            <p className="text-micro text-muted-foreground">
              Use each full prompt in order to run a complete end-to-end C2 operational flow.
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              disabled={loading}
              onClick={() => onChangeProfile(profile.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-micro transition-colors",
                activeProfile === profile.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/50 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                loading && "cursor-not-allowed opacity-50 hover:border-border/50 hover:text-muted-foreground",
              )}
            >
              {profile.label}
              {profile.detected && (
                <span className="ml-1 rounded-full bg-success/10 px-1 py-0 text-[10px] text-success">
                  detected
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Active profile: <span className="font-medium text-foreground/90">{activeProfileLabel}</span>
          {profileLoading ? " · detecting operational config…" : ""}
        </p>
        {profiles.find((p) => p.id === activeProfile)?.evidence?.length ? (
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            Evidence: {profiles.find((p) => p.id === activeProfile)?.evidence.join(" · ")}
          </p>
        ) : null}
      </div>

      {steps.map((step, index) => (
        <div
          key={step.id}
          className="space-y-2 rounded-lg border border-border/40 bg-background/40 p-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {index + 1}
              </span>
              <div>
                <p className="text-body-sm font-medium text-foreground/90">{step.title}</p>
                <p className="text-micro text-muted-foreground">{step.outcome}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Step {index + 1}
            </Badge>
          </div>

          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/40 p-2 text-micro text-foreground/85">
            {step.prompt}
          </pre>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              disabled={loading}
              className="h-7 gap-1.5 px-2.5 text-micro"
              onClick={() => void sendMessage(step.prompt)}
            >
              <Send className="h-3 w-3" />
              Use Prompt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              className="h-7 gap-1.5 px-2.5 text-micro"
              onClick={() => {
                navigator.clipboard.writeText(step.prompt)
                toast.success("Prompt copied")
              }}
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Progress bubble (assistant working with streaming events)         */
/* ------------------------------------------------------------------ */

function ProgressBubble({
  events,
  currentIndex,
}: {
  events: ProgressEvent[]
  currentIndex: number
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-7 w-7 shrink-0 ring-2 ring-primary/20">
        <AvatarFallback className="bg-primary/10 text-primary text-micro">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="w-full max-w-md rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] px-4 py-3 shadow-sm">
        {events.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-body-sm text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Working on your request…</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {events.slice(0, currentIndex + 1).map((event, idx) => (
                <div key={idx} className="flex items-start gap-2 text-micro">
                  <div
                    className={cn(
                      "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      idx === currentIndex ? "animate-pulse bg-primary" : "bg-success",
                    )}
                  />
                  <div className="flex-1">
                    {event.type === "step" && (
                      <span className="text-foreground/80">{event.step}</span>
                    )}
                    {event.type === "tool_start" && (
                      <span className="text-foreground/80">
                        Running{" "}
                        <code className="font-mono text-primary">{event.toolName}</code>
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
      <div className="flex items-start justify-end gap-3">
        <div
          className={cn(
            "max-w-[78%] rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm",
            msg.pending
              ? "border border-primary/40 bg-primary/85 text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          <p className="whitespace-pre-wrap text-body-sm leading-relaxed">{msg.content}</p>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-60">
            <p>
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {msg.pending && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                sending
              </span>
            )}
          </div>
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
      <Avatar className="h-7 w-7 shrink-0 ring-1 ring-primary/20">
        <AvatarFallback className="bg-primary/10 text-primary text-micro">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="group max-w-[80%] rounded-2xl rounded-bl-md border border-border/40 bg-muted/40 px-4 py-2.5">
        <div className="whitespace-pre-wrap font-mono text-body-sm leading-relaxed text-foreground/90">
          {content}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground/60">
            {new Date(timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            onClick={() => onCopy(content)}
            className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            title="Copy"
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

  const tone = isExecuting
    ? { ring: "border-info/30 bg-info/5", text: "text-info", Icon: Loader2 }
    : isCompleted
      ? { ring: "border-success/30 bg-success/5", text: "text-success", Icon: CheckCircle2 }
      : { ring: "border-destructive/30 bg-destructive/5", text: "text-destructive", Icon: XCircle }

  return (
    <div className="ml-10 flex items-start gap-3">
      <Collapsible open={expanded} onOpenChange={setExpanded} className="w-full">
        <div className={cn("overflow-hidden rounded-xl border", tone.ring)}>
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
          >
            <tone.Icon
              className={cn("h-3.5 w-3.5 shrink-0", tone.text, isExecuting && "animate-spin")}
            />
            <span className={cn("text-micro font-medium", tone.text)}>
              {isExecuting ? "Executing" : isCompleted ? "Tool call" : "Failed"}
            </span>
            <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-micro">
              {call.name}
            </code>
            {isExecuting && (
              <div className="flex items-center gap-1">
                <div className="h-1 w-1 animate-pulse rounded-full bg-info" />
                <div className="h-1 w-1 animate-pulse rounded-full bg-info delay-100" />
                <div className="h-1 w-1 animate-pulse rounded-full bg-info delay-200" />
              </div>
            )}
            <ChevronRight
              className={cn(
                "ml-auto h-3 w-3 text-muted-foreground/50 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="bg-border/40" />
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                <Terminal className="h-3 w-3" />
                <span>Arguments</span>
              </div>
              <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 px-3 py-2 font-mono text-micro text-foreground/90">
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
    <div className="ml-10 flex items-start gap-3">
      <Collapsible open={expanded} onOpenChange={setExpanded} className="w-full">
        <div
          className={cn(
            "overflow-hidden rounded-xl border",
            isError
              ? "border-destructive/30 bg-destructive/5"
              : "border-success/30 bg-success/5",
          )}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            {isError ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            )}
            <span
              className={cn(
                "text-micro font-medium",
                isError ? "text-destructive" : "text-success",
              )}
            >
              {isError ? "Tool error" : "Tool result"}
            </span>
            <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-micro">
              {result.name}
            </code>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => onCopy(result.content)}
                className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                title="Copy"
              >
                <Copy className="h-3 w-3" />
              </button>
              {isLong && (
                <CollapsibleTrigger
                  render={<button type="button" />}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
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
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-micro text-muted-foreground">
            {isLong && !expanded ? formatted.slice(0, 300) + "…" : formatted}
          </pre>
        </div>
      </Collapsible>
    </div>
  )
}
