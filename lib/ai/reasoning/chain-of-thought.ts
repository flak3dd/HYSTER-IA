/**
 * Chain-of-Thought Reasoning Engine
 * 
 * Implements explicit step-by-step reasoning with:
 * - Intermediate thought generation
 * - Self-consistency checking
 * - Thought decomposition for complex problems
 * - Reasoning confidence scoring
 * - Automatic thought pruning
 */

import { z } from 'zod'
import { randomUUID } from 'crypto'
import { chatComplete, type ChatMessage } from '../llm'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const ThoughtStatus = z.enum(['pending', 'in_progress', 'completed', 'pruned', 'failed'])
export type ThoughtStatus = z.infer<typeof ThoughtStatus>

export const ThoughtType = z.enum([
  'decomposition',
  'analysis',
  'inference',
  'verification',
  'synthesis',
  'planning',
  'evaluation',
  'abstraction',
  'analogy',
  'counterfactual',
  'multi_perspective',
])
export type ThoughtType = z.infer<typeof ThoughtType>

export interface Thought {
  id: string
  type: ThoughtType
  content: string
  status: ThoughtStatus
  confidence: number
  dependencies: string[] // IDs of thoughts this depends on
  dependents: string[] // IDs of thoughts that depend on this
  metadata: {
    timestamp: number
    executionTime?: number
    reasoningDepth: number
    importance: number
  }
  result?: any
  error?: string
}

export interface ReasoningStep {
  stepNumber: number
  thought: Thought
  intermediateConclusion?: string
  nextSteps: string[]
  confidence: number
}

export interface CoTConfig {
  maxDepth: number
  maxBranching: number
  selfConsistencySamples: number
  confidenceThreshold: number
  pruneThreshold: number
  enableVerification: boolean
  enableSynthesis: boolean
}

export interface CoTResult {
  finalAnswer: string
  confidence: number
  reasoningSteps: ReasoningStep[]
  prunedThoughts: Thought[]
  consistencyScore: number
  metadata: {
    totalThoughts: number
    executionTime: number
    averageConfidence: number
    reasoningDepth: number
  }
}

/* ------------------------------------------------------------------ */
/*  Chain-of-Thought Engine                                            */
/* ------------------------------------------------------------------ */

export class ChainOfThoughtEngine {
  private config: CoTConfig
  private thoughts: Map<string, Thought>
  private reasoningSteps: ReasoningStep[]
  private executionHistory: Map<string, any>

  constructor(config: Partial<CoTConfig> = {}) {
    this.config = {
      maxDepth: config.maxDepth || 5,
      maxBranching: config.maxBranching || 3,
      selfConsistencySamples: config.selfConsistencySamples || 3,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      pruneThreshold: config.pruneThreshold || 0.3,
      enableVerification: config.enableVerification !== false,
      enableSynthesis: config.enableSynthesis !== false,
    }
    this.thoughts = new Map()
    this.reasoningSteps = []
    this.executionHistory = new Map()
  }

  /**
   * Execute chain-of-thought reasoning for a given problem
   */
  async reason(
    problem: string,
    context: Record<string, unknown> = {},
    tools?: any[]
  ): Promise<CoTResult> {
    const startTime = Date.now()

    try {
      // Step 1: Decompose the problem
      const decompositionThought = await this.decomposeProblem(problem, context)
      this.thoughts.set(decompositionThought.id, decompositionThought)

      // Step 2: Generate reasoning steps
      await this.generateReasoningSteps(decompositionThought, context, tools)

      // Step 3: Execute thoughts in dependency order
      await this.executeThoughts(context, tools)

      // Step 4: Verify if enabled
      if (this.config.enableVerification) {
        await this.verifyReasoning(context)
      }

      // Step 5: Synthesize final answer if enabled
      const finalAnswer = this.config.enableSynthesis
        ? await this.synthesizeAnswer(problem, context)
        : this.extractFinalAnswer()

      // Step 6: Calculate consistency score
      const consistencyScore = await this.calculateConsistencyScore()

      // Step 7: Prune low-confidence thoughts
      const prunedThoughts = this.pruneThoughts()

      const executionTime = Date.now() - startTime

      return {
        finalAnswer,
        confidence: this.calculateOverallConfidence(),
        reasoningSteps: this.reasoningSteps,
        prunedThoughts,
        consistencyScore,
        metadata: {
          totalThoughts: this.thoughts.size,
          executionTime,
          averageConfidence: this.calculateAverageConfidence(),
          reasoningDepth: this.calculateMaxDepth(),
        },
      }
    } catch (error) {
      throw new Error(`Chain-of-thought reasoning failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Decompose the problem into sub-problems
   */
  private async decomposeProblem(
    problem: string,
    context: Record<string, unknown>
  ): Promise<Thought> {
    const thought: Thought = {
      id: randomUUID(),
      type: 'decomposition',
      content: `Decomposing problem: ${problem}`,
      status: 'in_progress',
      confidence: 0.8,
      dependencies: [],
      dependents: [],
      metadata: {
        timestamp: Date.now(),
        reasoningDepth: 0,
        importance: 1.0,
      },
    }

    try {
      const decompositionPrompt = this.buildDecompositionPrompt(problem, context)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: decompositionPrompt },
        ],
        temperature: 0.3,
      })

      const decomposition = this.parseDecomposition(response.content || '')
      thought.result = decomposition
      thought.status = 'completed'
      thought.confidence = 0.9
      thought.metadata.executionTime = Date.now() - thought.metadata.timestamp
    } catch (error) {
      thought.status = 'failed'
      thought.error = error instanceof Error ? error.message : String(error)
      thought.confidence = 0.2
    }

    return thought
  }

  /**
   * Generate reasoning steps from decomposition
   */
  private async generateReasoningSteps(
    decompositionThought: Thought,
    context: Record<string, unknown>,
    tools?: any[]
  ): Promise<void> {
    if (!decompositionThought.result || !Array.isArray(decompositionThought.result.subProblems)) {
      return
    }

    const subProblems = decompositionThought.result.subProblems as Array<{
      description: string
      priority: number
    }>

    for (let i = 0; i < subProblems.length; i++) {
      const subProblem = subProblems[i]
      
      const thought: Thought = {
        id: randomUUID(),
        type: 'analysis',
        content: `Analyzing: ${subProblem.description}`,
        status: 'pending',
        confidence: subProblem.priority / 10,
        dependencies: [decompositionThought.id],
        dependents: [],
        metadata: {
          timestamp: Date.now(),
          reasoningDepth: 1,
          importance: subProblem.priority / 10,
        },
      }

      decompositionThought.dependents.push(thought.id)
      this.thoughts.set(thought.id, thought)

      // Generate next-level thoughts if depth allows
      if (this.config.maxDepth > 1) {
        await this.generateSubThoughts(thought, context, 2, tools)
      }
    }
  }

  /**
   * Generate sub-thoughts for deeper reasoning
   */
  private async generateSubThoughts(
    parentThought: Thought,
    context: Record<string, unknown>,
    depth: number,
    tools?: any[]
  ): Promise<void> {
    if (depth > this.config.maxDepth) {
      return
    }

    const branching = Math.min(this.config.maxBranching, 3)
    
    for (let i = 0; i < branching; i++) {
      const thoughtType = this.selectThoughtType(depth, this.config.maxDepth)
      const thought: Thought = {
        id: randomUUID(),
        type: thoughtType,
        content: `Sub-thought ${i + 1} for: ${parentThought.content}`,
        status: 'pending',
        confidence: 0.5,
        dependencies: [parentThought.id],
        dependents: [],
        metadata: {
          timestamp: Date.now(),
          reasoningDepth: depth,
          importance: 0.7,
        },
      }

      parentThought.dependents.push(thought.id)
      this.thoughts.set(thought.id, thought)

      // Recursively generate deeper thoughts
      if (depth < this.config.maxDepth) {
        await this.generateSubThoughts(thought, context, depth + 1, tools)
      }
    }
  }

  /**
   * Select appropriate thought type based on depth
   */
  private selectThoughtType(depth: number, maxDepth: number): ThoughtType {
    if (depth === maxDepth) {
      return 'evaluation'
    } else if (depth === maxDepth - 1) {
      return Math.random() > 0.5 ? 'verification' : 'synthesis'
    } else if (depth === 1) {
      return Math.random() > 0.7 ? 'abstraction' : 'analysis'
    } else {
      const types: ThoughtType[] = ['inference', 'analogy', 'counterfactual', 'multi_perspective']
      return types[Math.floor(Math.random() * types.length)]
    }
  }

  /**
   * Generate analogy-based reasoning
   */
  async generateAnalogy(
    problem: string,
    context: Record<string, unknown> = {}
  ): Promise<Thought> {
    const thought: Thought = {
      id: randomUUID(),
      type: 'analogy',
      content: `Generating analogy for: ${problem}`,
      status: 'in_progress',
      confidence: 0.6,
      dependencies: [],
      dependents: [],
      metadata: {
        timestamp: Date.now(),
        reasoningDepth: 1,
        importance: 0.8,
      },
    }

    try {
      const prompt = `Problem: ${problem}\n\nContext: ${JSON.stringify(context)}\n\nGenerate a helpful analogy to understand this problem. Explain the analogy and how it maps to the original problem. Return JSON: { "analogy": "description", "mapping": "explanation", "confidence": 0.0-1.0 }`
      
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      })

      const result = this.parseThoughtResponse(response.content || '')
      thought.result = result
      thought.status = 'completed'
      thought.confidence = result.confidence || 0.6
      thought.metadata.executionTime = Date.now() - thought.metadata.timestamp
    } catch (error) {
      thought.status = 'failed'
      thought.error = error instanceof Error ? error.message : String(error)
      thought.confidence = 0.1
    }

    this.thoughts.set(thought.id, thought)
    return thought
  }

  /**
   * Generate counterfactual reasoning
   */
  async generateCounterfactual(
    problem: string,
    context: Record<string, unknown> = {}
  ): Promise<Thought> {
    const thought: Thought = {
      id: randomUUID(),
      type: 'counterfactual',
      content: `Exploring counterfactuals for: ${problem}`,
      status: 'in_progress',
      confidence: 0.5,
      dependencies: [],
      dependents: [],
      metadata: {
        timestamp: Date.now(),
        reasoningDepth: 1,
        importance: 0.7,
      },
    }

    try {
      const prompt = `Problem: ${problem}\n\nContext: ${JSON.stringify(context)}\n\nExplore "what if" scenarios by changing key assumptions. Identify which factors would change the outcome. Return JSON: { "scenarios": [{"assumption": "changed assumption", "impact": "expected impact"}], "confidence": 0.0-1.0 }`
      
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      })

      const result = this.parseThoughtResponse(response.content || '')
      thought.result = result
      thought.status = 'completed'
      thought.confidence = result.confidence || 0.5
      thought.metadata.executionTime = Date.now() - thought.metadata.timestamp
    } catch (error) {
      thought.status = 'failed'
      thought.error = error instanceof Error ? error.message : String(error)
      thought.confidence = 0.1
    }

    this.thoughts.set(thought.id, thought)
    return thought
  }

  /**
   * Generate multi-perspective reasoning
   */
  async generateMultiPerspective(
    problem: string,
    context: Record<string, unknown> = {}
  ): Promise<Thought> {
    const thought: Thought = {
      id: randomUUID(),
      type: 'multi_perspective',
      content: `Analyzing from multiple perspectives: ${problem}`,
      status: 'in_progress',
      confidence: 0.7,
      dependencies: [],
      dependents: [],
      metadata: {
        timestamp: Date.now(),
        reasoningDepth: 1,
        importance: 0.9,
      },
    }

    try {
      const prompt = `Problem: ${problem}\n\nContext: ${JSON.stringify(context)}\n\nAnalyze this problem from at least 3 different perspectives (e.g., technical, business, user, security, operational). For each perspective, identify key concerns and recommendations. Return JSON: { "perspectives": [{"name": "perspective name", "analysis": "analysis", "recommendations": ["rec1", "rec2"]}], "confidence": 0.0-1.0 }`
      
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      })

      const result = this.parseThoughtResponse(response.content || '')
      thought.result = result
      thought.status = 'completed'
      thought.confidence = result.confidence || 0.7
      thought.metadata.executionTime = Date.now() - thought.metadata.timestamp
    } catch (error) {
      thought.status = 'failed'
      thought.error = error instanceof Error ? error.message : String(error)
      thought.confidence = 0.1
    }

    this.thoughts.set(thought.id, thought)
    return thought
  }

  /**
   * Execute thoughts in dependency order
   */
  private async executeThoughts(
    context: Record<string, unknown>,
    tools?: any[]
  ): Promise<void> {
    const executed = new Set<string>()
    const toExecute = this.getThoughtsByDepth()

    for (const level of toExecute) {
      for (const thought of level) {
        if (executed.has(thought.id) || thought.status === 'pruned') {
          continue
        }

        // Check if dependencies are satisfied
        const dependenciesSatisfied = thought.dependencies.every(
          depId => {
            const dep = this.thoughts.get(depId)
            return dep && (dep.status === 'completed' || dep.status === 'pruned')
          }
        )

        if (!dependenciesSatisfied) {
          continue
        }

        await this.executeThought(thought, context, tools)
        executed.add(thought.id)

        // Create reasoning step
        this.reasoningSteps.push({
          stepNumber: this.reasoningSteps.length + 1,
          thought,
          intermediateConclusion: thought.result?.conclusion,
          nextSteps: thought.dependents,
          confidence: thought.confidence,
        })
      }
    }
  }

  /**
   * Execute a single thought
   */
  private async executeThought(
    thought: Thought,
    context: Record<string, unknown>,
    tools?: any[]
  ): Promise<void> {
    thought.status = 'in_progress'
    const startTime = Date.now()

    try {
      const prompt = this.buildThoughtPrompt(thought, context, tools)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        tools,
      })

      const result = this.parseThoughtResponse(response.content || '')
      thought.result = result
      thought.status = 'completed'
      thought.confidence = result.confidence || 0.7
      thought.metadata.executionTime = Date.now() - startTime
    } catch (error) {
      thought.status = 'failed'
      thought.error = error instanceof Error ? error.message : String(error)
      thought.confidence = 0.1
      thought.metadata.executionTime = Date.now() - startTime
    }
  }

  /**
   * Verify reasoning through self-consistency
   */
  private async verifyReasoning(context: Record<string, unknown>): Promise<void> {
    const completedThoughts = Array.from(this.thoughts.values()).filter(
      t => t.status === 'completed'
    )

    for (const thought of completedThoughts) {
      if (thought.confidence < this.config.confidenceThreshold) {
        // Re-run with different samples for consistency check
        const samples: any[] = []
        
        for (let i = 0; i < this.config.selfConsistencySamples; i++) {
          try {
            const prompt = this.buildThoughtPrompt(thought, context)
            const response = await chatComplete({
              messages: [
                { role: 'system', content: this.getSystemPrompt() },
                { role: 'user', content: prompt },
              ],
              temperature: 0.5, // Higher temperature for diversity
            })

            samples.push(this.parseThoughtResponse(response.content || ''))
          } catch (error) {
            // Ignore errors in consistency check
          }
        }

        // Check consistency
        if (samples.length > 0) {
          const consistency = this.calculateSampleConsistency(samples)
          if (consistency < 0.6) {
            // Low consistency, mark for review
            thought.confidence = Math.min(thought.confidence, 0.5)
          }
        }
      }
    }
  }

  /**
   * Synthesize final answer from all reasoning steps
   */
  private async synthesizeAnswer(
    problem: string,
    context: Record<string, unknown>
  ): Promise<string> {
    const completedThoughts = Array.from(this.thoughts.values())
      .filter(t => t.status === 'completed')
      .sort((a, b) => b.metadata.importance - a.metadata.importance)

    const synthesisPrompt = this.buildSynthesisPrompt(problem, completedThoughts, context)
    
    const response = await chatComplete({
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: synthesisPrompt },
      ],
      temperature: 0.3,
    })

    return response.content || 'Unable to synthesize answer'
  }

  /**
   * Extract final answer from reasoning steps
   */
  private extractFinalAnswer(): string {
    if (this.reasoningSteps.length === 0) {
      return 'No reasoning steps available'
    }

    const lastStep = this.reasoningSteps[this.reasoningSteps.length - 1]
    return lastStep.intermediateConclusion || 
           lastStep.thought.result?.conclusion ||
           'Answer derived from reasoning steps'
  }

  /**
   * Calculate consistency score across samples
   */
  private async calculateConsistencyScore(): Promise<number> {
    const completedThoughts = Array.from(this.thoughts.values()).filter(
      t => t.status === 'completed'
    )

    if (completedThoughts.length === 0) {
      return 0
    }

    // Simple consistency based on confidence distribution
    const confidences = completedThoughts.map(t => t.confidence)
    const meanConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - meanConfidence, 2), 0) / confidences.length
    const consistency = 1 - Math.min(variance, 1)

    return consistency
  }

  /**
   * Prune low-confidence thoughts
   */
  private pruneThoughts(): Thought[] {
    const pruned: Thought[] = []

    for (const thought of this.thoughts.values()) {
      if (thought.confidence < this.config.pruneThreshold && thought.status === 'completed') {
        thought.status = 'pruned'
        pruned.push(thought)
      }
    }

    return pruned
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(): number {
    const completedThoughts = Array.from(this.thoughts.values()).filter(
      t => t.status === 'completed'
    )

    if (completedThoughts.length === 0) {
      return 0
    }

    const weightedConfidence = completedThoughts.reduce((sum, thought) => {
      return sum + thought.confidence * thought.metadata.importance
    }, 0)

    const totalImportance = completedThoughts.reduce(
      (sum, thought) => sum + thought.metadata.importance,
      0
    )

    return totalImportance > 0 ? weightedConfidence / totalImportance : 0
  }

  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(): number {
    const completedThoughts = Array.from(this.thoughts.values()).filter(
      t => t.status === 'completed'
    )

    if (completedThoughts.length === 0) {
      return 0
    }

    return completedThoughts.reduce((sum, t) => sum + t.confidence, 0) / completedThoughts.length
  }

  /**
   * Calculate maximum reasoning depth
   */
  private calculateMaxDepth(): number {
    let maxDepth = 0
    for (const thought of this.thoughts.values()) {
      maxDepth = Math.max(maxDepth, thought.metadata.reasoningDepth)
    }
    return maxDepth
  }

  /* ------------------------------------------------------------------ */
  /*  Helper Methods                                                     */
  /* ------------------------------------------------------------------ */

  private getThoughtsByDepth(): Thought[][] {
    const byDepth = new Map<number, Thought[]>()
    
    for (const thought of this.thoughts.values()) {
      const depth = thought.metadata.reasoningDepth
      if (!byDepth.has(depth)) {
        byDepth.set(depth, [])
      }
      byDepth.get(depth)!.push(thought)
    }

    return Array.from(byDepth.entries())
      .sort(([a], [b]) => a - b)
      .map(([, thoughts]) => thoughts)
  }

  private calculateSampleConsistency(samples: any[]): number {
    if (samples.length < 2) {
      return 1
    }

    // Simple consistency based on conclusion similarity
    const conclusions = samples.map(s => s.conclusion || '').filter(Boolean)
    if (conclusions.length === 0) {
      return 0
    }

    const firstConclusion = conclusions[0].toLowerCase()
    const matches = conclusions.filter(c => 
      c.toLowerCase().includes(firstConclusion.substring(0, 20))
    ).length

    return matches / conclusions.length
  }

  private getSystemPrompt(): string {
    return `You are an advanced reasoning engine that performs step-by-step chain-of-thought analysis.
    
GUIDELINES:
- Break down complex problems into smaller, manageable steps
- Show your reasoning process explicitly
- Provide confidence scores for each step
- Identify dependencies between reasoning steps
- Verify your conclusions when possible
- Synthesize findings into clear conclusions`
  }

  private buildDecompositionPrompt(problem: string, context: Record<string, unknown>): string {
    let prompt = `Problem: ${problem}\n\n`
    
    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    prompt += `Please decompose this problem into sub-problems. Return JSON:
{
  "subProblems": [
    {
      "description": "sub-problem description",
      "priority": 1-10
    }
  ],
  "estimatedSteps": number
}`

    return prompt
  }

  private buildThoughtPrompt(
    thought: Thought,
    context: Record<string, unknown>,
    tools?: any[]
  ): string {
    let prompt = `Thought: ${thought.content}\n\n`
    
    // Add dependency results
    if (thought.dependencies.length > 0) {
      prompt += `Dependency Results:\n`
      for (const depId of thought.dependencies) {
        const dep = this.thoughts.get(depId)
        if (dep && dep.result) {
          prompt += `- ${dep.content}: ${JSON.stringify(dep.result)}\n`
        }
      }
      prompt += '\n'
    }

    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    if (tools && tools.length > 0) {
      prompt += `Available Tools:\n${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}\n\n`
    }

    prompt += `Provide your analysis with a confidence score. Return JSON:
{
  "analysis": "detailed analysis",
  "conclusion": "key conclusion",
  "confidence": 0.0-1.0,
  "nextSteps": ["step1", "step2"]
}`

    return prompt
  }

  private buildSynthesisPrompt(
    problem: string,
    thoughts: Thought[],
    context: Record<string, unknown>
  ): string {
    let prompt = `Problem: ${problem}\n\n`
    prompt += `Reasoning Steps:\n`
    
    for (const thought of thoughts) {
      prompt += `- ${thought.content} (confidence: ${thought.confidence})\n`
      if (thought.result) {
        prompt += `  Result: ${JSON.stringify(thought.result)}\n`
      }
    }

    prompt += `\nSynthesize these reasoning steps into a final answer.`
    return prompt
  }

  /**
   * Extract JSON from response using proper parsing without regex.
   * Finds first '{' and last '}' to extract JSON object.
   */
  private extractJsonObject(response: string): string | null {
    const startIndex = response.indexOf('{')
    const endIndex = response.lastIndexOf('}')

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      return null
    }

    return response.slice(startIndex, endIndex + 1)
  }

  /**
   * Parse decomposition using structured output schema.
   * Replaces regex-based JSON extraction with generateObject().
   */
  private async parseDecompositionStructured(response: string): Promise<any> {
    try {
      const { generateObject } = await import('ai')
      const { DecompositionSchema } = await import('./schemas')
      const { getExtractorModel } = await import('./extractor-provider')

      const result = await generateObject({
        model: getExtractorModel(),
        schema: DecompositionSchema,
        prompt: `Parse this decomposition response into structured data:\n\n${response}`,
        temperature: 0,
      })
      return result.object
    } catch {
      return { subProblems: [], estimatedSteps: 1 }
    }
  }

  /**
   * Parse thought response using structured output schema.
   * Replaces regex-based JSON extraction with generateObject().
   */
  private async parseThoughtResponseStructured(response: string): Promise<any> {
    try {
      const { generateObject } = await import('ai')
      const { ThoughtAnalysisSchema } = await import('./schemas')
      const { getExtractorModel } = await import('./extractor-provider')

      const result = await generateObject({
        model: getExtractorModel(),
        schema: ThoughtAnalysisSchema,
        prompt: `Parse this thought analysis into structured data:\n\n${response}`,
        temperature: 0,
      })
      return result.object
    } catch {
      return { analysis: response, confidence: 0.5 }
    }
  }

  /**
   * @deprecated Use parseDecompositionStructured() instead.
   * Kept for backward compatibility during migration.
   */
  private parseDecomposition(response: string): any {
    try {
      const jsonStr = this.extractJsonObject(response)
      return jsonStr ? JSON.parse(jsonStr) : { subProblems: [], estimatedSteps: 1 }
    } catch {
      return { subProblems: [], estimatedSteps: 1 }
    }
  }

  /**
   * @deprecated Use parseThoughtResponseStructured() instead.
   * Kept for backward compatibility during migration.
   */
  private parseThoughtResponse(response: string): any {
    try {
      const jsonStr = this.extractJsonObject(response)
      return jsonStr ? JSON.parse(jsonStr) : { analysis: response, confidence: 0.5 }
    } catch {
      return { analysis: response, confidence: 0.5 }
    }
  }

  /**
   * Get all thoughts
   */
  getThoughts(): Thought[] {
    return Array.from(this.thoughts.values())
  }

  /**
   * Get reasoning steps
   */
  getReasoningSteps(): ReasoningStep[] {
    return this.reasoningSteps
  }

  /**
   * Clear internal state
   */
  clear(): void {
    this.thoughts.clear()
    this.reasoningSteps = []
    this.executionHistory.clear()
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton Instance                                                 */
/* ------------------------------------------------------------------ */

const cotEngine = new ChainOfThoughtEngine()

export { cotEngine }

// Alias for backward compatibility
export { ChainOfThoughtEngine as ChainOfThoughtReasoning }