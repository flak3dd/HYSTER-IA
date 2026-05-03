export type AgentToolContext = {
  userId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
  signal?: AbortSignal
  invokerUid?: string
}

export type AgentTool<TInput = unknown, TOutput = unknown> = {
  name: string
  description: string
  parameters?: any
  inputSchema?: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
  jsonSchema?: any
  execute?: (input: TInput, ctx: AgentToolContext) => Promise<TOutput>
  run?: (input: TInput, ctx: AgentToolContext) => Promise<TOutput>
}