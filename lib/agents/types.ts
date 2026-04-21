import { z } from "zod"

export const AgentTaskStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
])
export type AgentTaskStatus = z.infer<typeof AgentTaskStatus>

export const AgentStepKind = z.enum([
  "thought",
  "tool_call",
  "tool_result",
  "assistant_message",
  "error",
  "status",
])
export type AgentStepKind = z.infer<typeof AgentStepKind>

export const AgentStep = z.object({
  index: z.number().int().min(0),
  kind: AgentStepKind,
  at: z.string(),
  content: z.string(),
  tool: z.string().nullable().default(null),
  arguments: z.unknown().optional(),
  result: z.unknown().optional(),
})
export type AgentStep = z.infer<typeof AgentStep>

export const AgentTaskCreateInput = z.object({
  prompt: z.string().min(1).max(20_000),
  model: z.string().min(1).optional(),
  maxSteps: z.number().int().min(1).max(100).optional(),
  allowedTools: z.array(z.string()).optional(),
})
export type AgentTaskCreateInput = z.infer<typeof AgentTaskCreateInput>

export const AgentTask = z.object({
  id: z.string().min(1),
  status: AgentTaskStatus,
  prompt: z.string(),
  model: z.string(),
  allowedTools: z.array(z.string()),
  maxSteps: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable().default(null),
  createdBy: z.string(),
  result: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  stepCount: z.number().int().nonnegative().default(0),
})
export type AgentTask = z.infer<typeof AgentTask>
