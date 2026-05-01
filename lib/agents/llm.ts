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

  // Provider priority: Azure OpenAI > xAI (Grok) > OpenRouter > legacy LLM_PROVIDER_*
  let completionUrl: string
  let headers: Record<string, string>
  let model: string

  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY) {
    // Azure OpenAI: POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}
    const endpoint = env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")
    const deployment = opts.model ?? env.AZURE_OPENAI_DEPLOYMENT
    completionUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${env.AZURE_OPENAI_API_VERSION}`
    model = deployment
    headers = {
      "content-type": "application/json",
      "api-key": env.AZURE_OPENAI_API_KEY,
    }
  } else if (env.XAI_API_KEY) {
    // xAI Grok — OpenAI-compatible endpoint
    completionUrl = `${env.XAI_BASE_URL}/chat/completions`
    model = opts.model ?? env.XAI_MODEL
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${env.XAI_API_KEY}`,
    }
  } else if (env.OPENROUTER_API_KEY) {
    completionUrl = `${env.OPENROUTER_BASE_URL}/chat/completions`
    model = opts.model ?? env.OPENROUTER_MODEL
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Hysteria2 C2 Panel",
    }
  } else if (env.LLM_PROVIDER_API_KEY) {
    completionUrl = `${env.LLM_PROVIDER_BASE_URL}/chat/completions`
    model = opts.model ?? env.LLM_MODEL
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${env.LLM_PROVIDER_API_KEY}`,
    }
  } else {
    throw new Error(
      "No LLM provider configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY, " +
      "XAI_API_KEY, OPENROUTER_API_KEY, or LLM_PROVIDER_API_KEY in your environment.",
    )
  }

  const res = await proxyFetch(completionUrl, {
    method: "POST",
    purpose: "llm",
    headers,
    body: JSON.stringify({
      // Azure ignores the `model` field (deployment is in the URL), but other providers need it
      model,
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
