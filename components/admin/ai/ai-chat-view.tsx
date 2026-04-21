"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

/* ------------------------------------------------------------------ */
/*  Prompt suggestions                                                */
/* ------------------------------------------------------------------ */

const PROMPT_SUGGESTIONS = [
  "Generate optimized Hysteria2 config for high packet loss environments",
  "Create a server config with salamander obfuscation on port 8443",
  "Suggest masquerade settings that mimic a CDN endpoint",
  "Configure Hysteria2 for maximum throughput (10 Gbps up/down)",
  "Set up ACME TLS with Let's Encrypt for proxy.example.com",
  "Create a minimal config for a SOCKS5 relay node",
]

/* ------------------------------------------------------------------ */
/*  Main view                                                         */
/* ------------------------------------------------------------------ */

export function AiChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const msgIdRef = useRef(0)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return
      const userMsg: ChatMessage = {
        id: String(++msgIdRef.current),
        role: "user",
        content: prompt.trim(),
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      setLoading(true)

      try {
        const res = await fetch("/api/admin/config/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim() }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }))
          throw new Error(err.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json()
        const assistantMsg: ChatMessage = {
          id: String(++msgIdRef.current),
          role: "assistant",
          content: data.yaml ?? "No response generated.",
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, assistantMsg])
        setTimeout(scrollToBottom, 100)
      } catch (err) {
        toast.error("AI request failed", {
          description: err instanceof Error ? err.message : "unknown",
        })
        const errorMsg: ChatMessage = {
          id: String(++msgIdRef.current),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Request failed"}`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">AI Config Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Use Blackbox AI (or your configured LLM provider) to generate and optimize
          Hysteria2 server configurations. Generated configs are previews only — review
          before applying.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* ---- Chat panel ---- */}
        <Card className="flex flex-col" style={{ minHeight: "500px" } as React.CSSProperties}>
          <CardContent className="flex flex-1 flex-col p-0">
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Start by typing a prompt or selecting a suggestion →
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="relative">
                          <pre className="whitespace-pre-wrap font-mono text-xs">
                            {msg.content}
                          </pre>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="absolute right-0 top-0"
                            onClick={() => copyToClipboard(msg.content)}
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
                ))
              )}
              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                    Generating config…
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
                  placeholder="Describe the Hysteria2 config you need…"
                  rows={2}
                  className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
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

        {/* ---- Suggestions panel ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Prompt Suggestions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {PROMPT_SUGGESTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  disabled={loading}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
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
                <code className="rounded bg-muted px-1">LLM_PROVIDER_API_KEY</code>) to
                generate Hysteria2 server configurations.
              </p>
              <p>
                For Blackbox AI, set{" "}
                <code className="rounded bg-muted px-1">
                  LLM_PROVIDER_BASE_URL=https://api.blackbox.ai/api/chat
                </code>
              </p>
              <p>
                Generated configs are <strong>previews only</strong>. Always review before
                applying to your server.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
