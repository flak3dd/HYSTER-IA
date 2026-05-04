import { z } from "zod"

/* ------------------------------------------------------------------ */
/*  Chat message types for multi-tool AI conversations                */
/* ------------------------------------------------------------------ */

export const AiMessageRole = z.enum(["system", "user", "assistant", "tool"])
export type AiMessageRole = z.infer<typeof AiMessageRole>

export const AiToolCall = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(),
})
export type AiToolCall = z.infer<typeof AiToolCall>

export const AiToolResult = z.object({
  toolCallId: z.string(),
  name: z.string(),
  content: z.string(),
})
export type AiToolResult = z.infer<typeof AiToolResult>

export const AiMessage = z.object({
  role: AiMessageRole,
  content: z.string().nullable().default(null),
  toolCalls: z.array(AiToolCall).optional(),
  toolResult: AiToolResult.optional(),
  timestamp: z.number().int(),
})
export type AiMessage = z.infer<typeof AiMessage>

/* ------------------------------------------------------------------ */
/*  Conversation                                                      */
/* ------------------------------------------------------------------ */

export const AiConversation = z.object({
  id: z.string().min(1),
  title: z.string().max(200).default("New conversation"),
  messages: z.array(AiMessage).default([]),
  createdBy: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  tags: z.array(z.string()).default([]),
})
export type AiConversation = z.infer<typeof AiConversation>

export const AiConversationCreate = z.object({
  title: z.string().max(200).optional(),
})
export type AiConversationCreate = z.infer<typeof AiConversationCreate>

export const AiConversationUpdate = z.object({
  title: z.string().max(200).optional(),
  tags: z.array(z.string()).optional(),
})
export type AiConversationUpdate = z.infer<typeof AiConversationUpdate>

/* ------------------------------------------------------------------ */
/*  Chat request / response                                           */
/* ------------------------------------------------------------------ */

export const AiChatRequest = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1).max(20_000),
})
export type AiChatRequest = z.infer<typeof AiChatRequest>

/* ------------------------------------------------------------------ */
/*  Operational templates                                             */
/* ------------------------------------------------------------------ */

export type AiTemplate = {
  id: string
  label: string
  description: string
  prompt: string
  category: "config" | "traffic" | "troubleshoot" | "management" | "payload"
}
