import { z } from "zod"

/* ------------------------------------------------------------------ */
/*  Workflow Session Types                                             */
/* ------------------------------------------------------------------ */

export const WorkflowSessionStatus = z.enum([
  "initialized",
  "awaiting_input",
  "processing",
  "executing",
  "completed",
  "failed",
  "cancelled",
])
export type WorkflowSessionStatus = z.infer<typeof WorkflowSessionStatus>

export const WorkflowStepType = z.enum([
  "ai_question",
  "user_response",
  "backend_execution",
  "result_display",
  "error_handling",
])
export type WorkflowStepType = z.infer<typeof WorkflowStepType>

export const WorkflowStep = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: WorkflowStepType,
  order: z.number().int(),
  content: z.string().optional(),
  aiPrompt: z.string().optional(),
  userResponse: z.string().optional(),
  functionToExecute: z.string().optional(),
  functionParameters: z.record(z.string(), z.unknown()).optional(),
  executionResult: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
  completed: z.boolean().default(false),
})
export type WorkflowStep = z.infer<typeof WorkflowStep>

export const WorkflowSession = z.object({
  id: z.string(),
  userId: z.string(),
  status: WorkflowSessionStatus,
  currentStepOrder: z.number().int().default(0),
  workflowType: z.string().optional(),
  context: z.record(z.string(), z.unknown()).default({}),
  steps: z.array(WorkflowStep).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
})
export type WorkflowSession = z.infer<typeof WorkflowSession>

/* ------------------------------------------------------------------ */
/*  Backend Function Registry                                          */
/* ------------------------------------------------------------------ */

export const BackendFunctionParameter = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  description: z.string(),
  required: z.boolean().default(true),
  defaultValue: z.unknown().optional(),
})
export type BackendFunctionParameter = z.infer<typeof BackendFunctionParameter>

export const BackendFunction = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  parameters: z.array(BackendFunctionParameter),
  implementation: z.string(), // Reference to the actual implementation
  requiresAuth: z.boolean().default(true),
  dangerous: z.boolean().default(false),
  enabled: z.boolean().default(true),
})
export type BackendFunction = z.infer<typeof BackendFunction>

/* ------------------------------------------------------------------ */
/*  AI Analysis Types                                                  */
/* ------------------------------------------------------------------ */

export const IntentAnalysis = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  extractedParameters: z.record(z.string(), z.unknown()).default({}),
  suggestedFunction: z.string().optional(),
  requiresClarification: z.boolean().default(false),
  clarificationQuestions: z.array(z.string()).default([]),
  suggestedChaining: z.array(z.string()).optional(),
  alternativeApproaches: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  estimatedSteps: z.number().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
})
export type IntentAnalysis = z.infer<typeof IntentAnalysis>

/* ------------------------------------------------------------------ */
/*  API Types                                                          */
/* ------------------------------------------------------------------ */

export const CreateWorkflowSessionInput = z.object({
  userId: z.string(),
  initialRequest: z.string(),
  workflowType: z.string().optional(),
})
export type CreateWorkflowSessionInput = z.infer<typeof CreateWorkflowSessionInput>

export const WorkflowStepResponse = z.object({
  sessionId: z.string(),
  stepId: z.string(),
  response: z.string(),
})
export type WorkflowStepResponse = z.infer<typeof WorkflowStepResponse>

export const WorkflowSessionResponse = z.object({
  session: WorkflowSession,
  nextAction: z.enum(["await_input", "processing", "completed", "error"]),
  message: z.string(),
  currentStep: WorkflowStep.optional(),
})
export type WorkflowSessionResponse = z.infer<typeof WorkflowSessionResponse>