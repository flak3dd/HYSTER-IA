import { z } from "zod"
import { serverEnv } from "@/lib/env"
import { proxyFetch } from "@/lib/net/fetch"

export type ChatRole = "system" | "user" | "assistant" | "tool"

export type ChatMessage = {
  role: ChatRole
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ChatToolCall[]
}

export type ChatToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export type ChatToolDefinition = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const ChatCompletionResponse = z.object({
  id: z.string(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().int(),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                type: z.literal("function"),
                function: z.object({
                  name: z.string(),
                  arguments: z.string(),
                }),
              }),
            )
            .optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
})

export type ChatCompletionResult = {
  content: string | null
  toolCalls: ChatToolCall[]
  finishReason: string | null
}

export async function chatComplete(opts: {
  messages: ChatMessage[]
  tools?: ChatToolDefinition[]
  model?: string
  temperature?: number
  signal?: AbortSignal
}): Promise<ChatCompletionResult> {
  const env = serverEnv()
  
  // Prefer OpenRouter configuration, fall back to legacy LLM configuration
  const apiKey = env.OPENROUTER_API_KEY || env.LLM_PROVIDER_API_KEY
  const baseUrl = env.OPENROUTER_API_KEY ? env.OPENROUTER_BASE_URL : env.LLM_PROVIDER_BASE_URL
  const model = opts.model ?? (env.OPENROUTER_API_KEY ? env.OPENROUTER_MODEL : env.LLM_MODEL)
  
  if (!apiKey) {
    throw new Error("Neither OPENROUTER_API_KEY nor LLM_PROVIDER_API_KEY is set")
  }

  const res = await proxyFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    purpose: "llm",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // Add OpenRouter-specific headers if using OpenRouter
      ...(env.OPENROUTER_API_KEY ? {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Hysteria2 C2 Panel",
      } : {}),
    },
    body: JSON.stringify({
      model: model,
      temperature: opts.temperature ?? env.LLM_TEMPERATURE,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.tools && opts.tools.length > 0 ? "auto" : undefined,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`LLM ${res.status}: ${body.slice(0, 500)}`)
  }

  const raw: unknown = await res.json()
  const parsed = ChatCompletionResponse.parse(raw)
  const choice = parsed.choices[0]
  return {
    content: choice.message.content ?? null,
    toolCalls: choice.message.tool_calls ?? [],
    finishReason: choice.finish_reason ?? null,
  }
}
