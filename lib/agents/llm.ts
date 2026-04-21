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
  const apiKey = env.LLM_PROVIDER_API_KEY
  if (!apiKey) {
    throw new Error("LLM_PROVIDER_API_KEY is not set")
  }

  const res = await proxyFetch(`${env.LLM_PROVIDER_BASE_URL}/chat/completions`, {
    method: "POST",
    purpose: "llm",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? env.LLM_MODEL,
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
