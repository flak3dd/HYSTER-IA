/**
 * Reasoning Trace System
 * 
 * Provides complete traceability of AI decisions with:
 * - Complete reasoning path logging
 * - Decision tree visualization support
 * - Influence tracking
 * - Exportable audit trails
 * - Performance metrics
 */

import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { Thought, ReasoningStep } from './chain-of-thought'
import type { UncertaintyAssessment, KnowledgeGap } from './meta-cognition'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const TraceEventType = z.enum([
  'reasoning_start',
  'thought_created',
  'thought_executed',
  'decision_made',
  'tool_called',
  'uncertainty_assessed',
  'knowledge_gap_detected',
  'strategy_selected',
  'reasoning_complete',
  'error_occurred',
])
export type TraceEventType = z.infer<typeof TraceEventType>

export interface TraceEvent {
  id: string
  type: TraceEventType
  timestamp: number
  sessionId: string
  data: Record<string, unknown>
  parentId?: string
  metadata: {
    executionTime?: number
    confidence?: number
    influence?: number
  }
}

export interface DecisionNode {
  id: string
  label: string
  type: 'decision' | 'action' | 'outcome'
  confidence: number
  children: DecisionNode[]
  metadata: {
    timestamp: number
    executionTime?: number
    thoughtId?: string
    toolName?: string
  }
}

export interface ReasoningTrace {
  id: string
  sessionId: string
  startTime: number
  endTime?: number
  events: TraceEvent[]
  decisionTree: DecisionNode
  thoughts: Thought[]
  uncertaintyAssessments: UncertaintyAssessment[]
  knowledgeGaps: KnowledgeGap[]
  reasoningSteps: ReasoningStep[]
  finalDecision: {
    action: string
    confidence: number
    reasoning: string
  }
  metadata: {
    totalEvents: number
    totalExecutionTime: number
    averageConfidence: number
    maxDepth: number
    errorCount: number
  }
}

export interface TraceFilter {
  sessionId?: string
  eventType?: TraceEventType
  since?: number
  until?: number
  minConfidence?: number
  hasErrors?: boolean
}

/* ------------------------------------------------------------------ */
/*  Reasoning Trace System                                             */
/* ------------------------------------------------------------------ */

export class ReasoningTraceSystem {
  private traces: Map<string, ReasoningTrace>
  private currentSessionId: string | null
  private currentEvents: TraceEvent[]
  private decisionTreeBuilder: DecisionTreeBuilder

  constructor() {
    this.traces = new Map()
    this.currentSessionId = null
    this.currentEvents = []
    this.decisionTreeBuilder = new DecisionTreeBuilder()
  }

  /**
   * Start a new reasoning trace session
   */
  startSession(sessionId?: string): string {
    const id = sessionId || randomUUID()
    this.currentSessionId = id
    this.currentEvents = []
    this.decisionTreeBuilder.reset()

    this.logEvent('reasoning_start', {
      sessionId: id,
      timestamp: Date.now(),
    })

    return id
  }

  /**
   * End the current reasoning trace session
   */
  endSession(finalDecision: {
    action: string
    confidence: number
    reasoning: string
  }): ReasoningTrace | null {
    if (!this.currentSessionId) {
      return null
    }

    const endTime = Date.now()
    const startTime = this.currentEvents[0]?.timestamp || endTime

    const trace: ReasoningTrace = {
      id: randomUUID(),
      sessionId: this.currentSessionId,
      startTime,
      endTime,
      events: [...this.currentEvents],
      decisionTree: this.decisionTreeBuilder.build(),
      thoughts: [],
      uncertaintyAssessments: [],
      knowledgeGaps: [],
      reasoningSteps: [],
      finalDecision,
      metadata: this.calculateMetadata(startTime, endTime),
    }

    this.traces.set(trace.id, trace)
    this.currentSessionId = null
    this.currentEvents = []

    this.logEvent('reasoning_complete', {
      traceId: trace.id,
      finalDecision,
    })

    return trace
  }

  /**
   * Log a trace event
   */
  logEvent(
    type: TraceEventType,
    data: Record<string, unknown>,
    parentId?: string,
    metadata: TraceEvent['metadata'] = {}
  ): void {
    if (!this.currentSessionId) {
      console.warn('No active session to log event')
      return
    }

    const event: TraceEvent = {
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      data,
      parentId,
      metadata,
    }

    this.currentEvents.push(event)

    // Update decision tree
    this.decisionTreeBuilder.addEvent(event)

    // Handle specific event types
    if (type === 'error_occurred') {
      // Error handling
    }
  }

  /**
   * Add a thought to the trace
   */
  addThought(thought: Thought): void {
    if (!this.currentSessionId) {
      return
    }

    this.logEvent('thought_created', {
      thoughtId: thought.id,
      type: thought.type,
      content: thought.content,
      confidence: thought.confidence,
    }, undefined, {
      confidence: thought.confidence,
    })

    this.logEvent('thought_executed', {
      thoughtId: thought.id,
      result: thought.result,
      status: thought.status,
      executionTime: thought.metadata.executionTime,
    }, undefined, {
      executionTime: thought.metadata.executionTime,
    })
  }

  /**
   * Add an uncertainty assessment to the trace
   */
  addUncertaintyAssessment(assessment: UncertaintyAssessment): void {
    if (!this.currentSessionId) {
      return
    }

    this.logEvent('uncertainty_assessed', {
      assessmentId: assessment.id,
      source: assessment.source,
      confidence: assessment.confidence,
      severity: assessment.severity,
    }, undefined, {
      confidence: assessment.confidence,
    })
  }

  /**
   * Add a knowledge gap to the trace
   */
  addKnowledgeGap(gap: KnowledgeGap): void {
    if (!this.currentSessionId) {
      return
    }

    this.logEvent('knowledge_gap_detected', {
      gapId: gap.id,
      type: gap.type,
      description: gap.description,
      severity: gap.severity,
    })
  }

  /**
   * Add a reasoning step to the trace
   */
  addReasoningStep(step: ReasoningStep): void {
    if (!this.currentSessionId) {
      return
    }

    this.logEvent('decision_made', {
      stepNumber: step.stepNumber,
      thoughtId: step.thought.id,
      confidence: step.confidence,
      conclusion: step.intermediateConclusion,
    }, undefined, {
      confidence: step.confidence,
    })
  }

  /**
   * Add a tool call to the trace
   */
  addToolCall(toolName: string, parameters: Record<string, unknown>, result?: any): void {
    if (!this.currentSessionId) {
      return
    }

    this.logEvent('tool_called', {
      toolName,
      parameters,
      result,
    })
  }

  /**
   * Add an error to the trace
   */
  addError(error: Error, context?: Record<string, unknown>): void {
    if (!this.currentSessionId) {
      return
    }

    this.logEvent('error_occurred', {
      message: error.message,
      stack: error.stack,
      context,
    })
  }

  /**
   * Get a trace by ID
   */
  getTrace(traceId: string): ReasoningTrace | undefined {
    return this.traces.get(traceId)
  }

  /**
   * Get traces by session ID
   */
  getTracesBySession(sessionId: string): ReasoningTrace[] {
    return Array.from(this.traces.values()).filter(
      trace => trace.sessionId === sessionId
    )
  }

  /**
   * Get all traces with optional filtering
   */
  getTraces(filter?: TraceFilter): ReasoningTrace[] {
    let traces = Array.from(this.traces.values())

    if (filter) {
      if (filter.sessionId) {
        traces = traces.filter(t => t.sessionId === filter.sessionId)
      }
      if (filter.since) {
        traces = traces.filter(t => t.startTime >= filter.since!)
      }
      if (filter.until) {
        traces = traces.filter(t => t.endTime && t.endTime <= filter.until!)
      }
      if (filter.minConfidence) {
        traces = traces.filter(t => 
          t.finalDecision.confidence >= filter.minConfidence!
        )
      }
      if (filter.hasErrors !== undefined) {
        traces = traces.filter(t => 
          filter.hasErrors ? t.metadata.errorCount > 0 : t.metadata.errorCount === 0
        )
      }
    }

    return traces.sort((a, b) => b.startTime - a.startTime)
  }

  /**
   * Get events from a trace
   */
  getEvents(traceId: string, filter?: {
    eventType?: TraceEventType
    since?: number
  }): TraceEvent[] {
    const trace = this.traces.get(traceId)
    if (!trace) {
      return []
    }

    let events = [...trace.events]

    if (filter) {
      if (filter.eventType) {
        events = events.filter(e => e.type === filter.eventType)
      }
      if (filter.since) {
        events = events.filter(e => e.timestamp >= filter.since!)
      }
    }

    return events.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Export trace as JSON
   */
  exportTrace(traceId: string): string | null {
    const trace = this.traces.get(traceId)
    if (!trace) {
      return null
    }

    return JSON.stringify(trace, null, 2)
  }

  /**
   * Export trace as decision tree (DOT format)
   */
  exportDecisionTree(traceId: string): string | null {
    const trace = this.traces.get(traceId)
    if (!trace) {
      return null
    }

    return this.decisionTreeToDot(trace.decisionTree)
  }

  /**
   * Get trace statistics
   */
  getStatistics(): {
    totalTraces: number
    totalEvents: number
    averageExecutionTime: number
    averageConfidence: number
    errorRate: number
    tracesBySession: Record<string, number>
  } {
    const traces = Array.from(this.traces.values())

    if (traces.length === 0) {
      return {
        totalTraces: 0,
        totalEvents: 0,
        averageExecutionTime: 0,
        averageConfidence: 0,
        errorRate: 0,
        tracesBySession: {},
      }
    }

    const totalEvents = traces.reduce((sum, t) => sum + t.events.length, 0)
    const avgExecutionTime = traces.reduce((sum, t) => 
      sum + t.metadata.totalExecutionTime, 0
    ) / traces.length
    const avgConfidence = traces.reduce((sum, t) => 
      sum + t.metadata.averageConfidence, 0
    ) / traces.length
    const errorRate = traces.filter(t => t.metadata.errorCount > 0).length / traces.length

    const tracesBySession: Record<string, number> = {}
    for (const trace of traces) {
      tracesBySession[trace.sessionId] = (tracesBySession[trace.sessionId] || 0) + 1
    }

    return {
      totalTraces: traces.length,
      totalEvents,
      averageExecutionTime: avgExecutionTime,
      averageConfidence: avgConfidence,
      errorRate,
      tracesBySession,
    }
  }

  /**
   * Clear old traces
   */
  clearOldTraces(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now()
    
    for (const [id, trace] of this.traces.entries()) {
      if (now - trace.startTime > maxAge) {
        this.traces.delete(id)
      }
    }
  }

  /**
   * Clear all traces
   */
  clearAll(): void {
    this.traces.clear()
    this.currentSessionId = null
    this.currentEvents = []
    this.decisionTreeBuilder.reset()
  }

  /* ------------------------------------------------------------------ */
  /*  Helper Methods                                                     */
  /* ------------------------------------------------------------------ */

  private calculateMetadata(startTime: number, endTime: number): ReasoningTrace['metadata'] {
    const totalExecutionTime = endTime - startTime
    const avgConfidence = this.currentEvents.reduce((sum, e) => 
      sum + (e.metadata.confidence || 0), 0
    ) / Math.max(this.currentEvents.length, 1)
    const errorCount = this.currentEvents.filter(e => e.type === 'error_occurred').length
    const maxDepth = this.decisionTreeBuilder.getMaxDepth()

    return {
      totalEvents: this.currentEvents.length,
      totalExecutionTime,
      averageConfidence: avgConfidence,
      maxDepth,
      errorCount,
    }
  }

  private decisionTreeToDot(node: DecisionNode, indent: string = ''): string {
    const lines: string[] = []
    
    lines.push(`${indent}"${node.id}" [label="${node.label}\\nConf: ${node.confidence.toFixed(2)}"]`)
    
    if (node.children.length > 0) {
      for (const child of node.children) {
        lines.push(`${indent}"${node.id}" -> "${child.id}"`)
        lines.push(this.decisionTreeToDot(child, indent))
      }
    }

    return lines.join('\n')
  }
}

/* ------------------------------------------------------------------ */
/*  Decision Tree Builder                                              */
/* ------------------------------------------------------------------ */

class DecisionTreeBuilder {
  private root: DecisionNode | null
  private nodeMap: Map<string, DecisionNode>
  private currentDepth: number

  constructor() {
    this.root = null
    this.nodeMap = new Map()
    this.currentDepth = 0
  }

  reset(): void {
    this.root = null
    this.nodeMap.clear()
    this.currentDepth = 0
  }

  addEvent(event: TraceEvent): void {
    const node: DecisionNode = {
      id: event.id,
      label: this.getEventLabel(event),
      type: this.getEventType(event.type),
      confidence: event.metadata.confidence || 0.5,
      children: [],
      metadata: {
        timestamp: event.timestamp,
        executionTime: event.metadata.executionTime,
        thoughtId: event.data.thoughtId as string,
        toolName: event.data.toolName as string,
      },
    }

    this.nodeMap.set(node.id, node)

    if (event.parentId && this.nodeMap.has(event.parentId)) {
      const parent = this.nodeMap.get(event.parentId)!
      parent.children.push(node)
    } else if (!this.root) {
      this.root = node
    }

    this.currentDepth = Math.max(this.currentDepth, this.calculateDepth(node))
  }

  build(): DecisionNode {
    return this.root || {
      id: 'root',
      label: 'No reasoning trace',
      type: 'outcome',
      confidence: 0,
      children: [],
      metadata: { timestamp: Date.now() },
    }
  }

  getMaxDepth(): number {
    return this.currentDepth
  }

  private getEventLabel(event: TraceEvent): string {
    switch (event.type) {
      case 'reasoning_start':
        return 'Start'
      case 'thought_created':
        return `Thought: ${event.data.type}`
      case 'thought_executed':
        return `Execute: ${event.data.status}`
      case 'decision_made':
        return `Decision: Step ${event.data.stepNumber}`
      case 'tool_called':
        return `Tool: ${event.data.toolName}`
      case 'uncertainty_assessed':
        return `Uncertainty: ${event.data.source}`
      case 'knowledge_gap_detected':
        return `Gap: ${event.data.type}`
      case 'strategy_selected':
        return `Strategy: ${event.data.strategy}`
      case 'reasoning_complete':
        return 'Complete'
      case 'error_occurred':
        return `Error: ${event.data.message}`
      default:
        return event.type
    }
  }

  private getEventType(type: TraceEventType): 'decision' | 'action' | 'outcome' {
    if (type === 'decision_made' || type === 'strategy_selected') {
      return 'decision'
    }
    if (type === 'tool_called' || type === 'thought_executed') {
      return 'action'
    }
    return 'outcome'
  }

  private calculateDepth(node: DecisionNode): number {
    if (node.children.length === 0) {
      return 1
    }
    return 1 + Math.max(...node.children.map(child => this.calculateDepth(child)))
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton Instance                                                 */
/* ------------------------------------------------------------------ */

const reasoningTraceSystem = new ReasoningTraceSystem()

export { reasoningTraceSystem }