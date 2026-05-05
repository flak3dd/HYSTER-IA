/**
 * Meta-Cognition Engine
 * 
 * Implements reasoning about reasoning with:
 * - Metacognitive monitoring
 * - Uncertainty quantification and calibration
 * - Knowledge gap detection
 * - Self-questioning and reflection
 * - Adaptive reasoning strategy selection
 */

import { z } from 'zod'
import { randomUUID } from 'crypto'
import { chatComplete, type ChatMessage } from '../llm'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const UncertaintySource = z.enum([
  'knowledge_gap',
  'ambiguous_input',
  'insufficient_context',
  'conflicting_information',
  'complex_dependency',
  'temporal_uncertainty',
  'model_limitation',
  'emotional_bias',
  'cognitive_load',
  'attention_deficit',
])
export type UncertaintySource = z.infer<typeof UncertaintySource>

export const EmotionalState = z.enum([
  'neutral',
  'confident',
  'uncertain',
  'curious',
  'cautious',
  'frustrated',
  'optimistic',
])
export type EmotionalState = z.infer<typeof EmotionalState>

export const KnowledgeGapType = z.enum([
  'missing_domain_knowledge',
  'missing_context',
  'outdated_information',
  'insufficient_data',
  'unknown_dependency',
])
export type KnowledgeGapType = z.infer<typeof KnowledgeGapType>

export interface UncertaintyAssessment {
  id: string
  source: UncertaintySource
  confidence: number
  reasoning: string
  timestamp: number
  severity: 'low' | 'medium' | 'high'
  mitigation?: string
}

export interface KnowledgeGap {
  id: string
  type: KnowledgeGapType
  description: string
  context: string
  severity: 'low' | 'medium' | 'high'
  suggestedAction: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
}

export interface MetacognitiveState {
  currentConfidence: number
  overallUncertainty: number
  activeKnowledgeGaps: KnowledgeGap[]
  reasoningStrategy: string
  selfQuestioningActive: boolean
  calibrationScore: number
  emotionalState: EmotionalState
  cognitiveLoad: number
  attentionFocus: number
  timestamp: number
}

export interface MetacognitiveConfig {
  enableUncertaintyQuantification: boolean
  enableKnowledgeGapDetection: boolean
  enableSelfQuestioning: boolean
  enableAdaptiveStrategy: boolean
  confidenceThreshold: number
  uncertaintyThreshold: number
  calibrationWindow: number
}

/* ------------------------------------------------------------------ */
/*  Meta-Cognition Engine                                              */
/* ------------------------------------------------------------------ */

export class MetaCognitionEngine {
  private config: MetacognitiveConfig
  private uncertaintyHistory: UncertaintyAssessment[]
  private knowledgeGaps: Map<string, KnowledgeGap>
  private calibrationHistory: Array<{
    predictedConfidence: number
    actualSuccess: number
    timestamp: number
  }>
  private reasoningStrategies: Map<string, any>
  private currentState: MetacognitiveState

  constructor(config: Partial<MetacognitiveConfig> = {}) {
    this.config = {
      enableUncertaintyQuantification: config.enableUncertaintyQuantification !== false,
      enableKnowledgeGapDetection: config.enableKnowledgeGapDetection !== false,
      enableSelfQuestioning: config.enableSelfQuestioning !== false,
      enableAdaptiveStrategy: config.enableAdaptiveStrategy !== false,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      uncertaintyThreshold: config.uncertaintyThreshold || 0.3,
      calibrationWindow: config.calibrationWindow || 100,
    }
    this.uncertaintyHistory = []
    this.knowledgeGaps = new Map()
    this.calibrationHistory = []
    this.reasoningStrategies = new Map()
    this.currentState = this.initializeState()
  }

  /**
   * Initialize metacognitive state
   */
  private initializeState(): MetacognitiveState {
    return {
      currentConfidence: 0.8,
      overallUncertainty: 0.2,
      activeKnowledgeGaps: [],
      reasoningStrategy: 'standard',
      selfQuestioningActive: false,
      calibrationScore: 0.8,
      emotionalState: 'neutral',
      cognitiveLoad: 0.3,
      attentionFocus: 0.8,
      timestamp: Date.now(),
    }
  }

  /**
   * Assess uncertainty for a given reasoning task
   */
  async assessUncertainty(
    task: string,
    context: Record<string, unknown> = {},
    predictedConfidence?: number
  ): Promise<UncertaintyAssessment> {
    if (!this.config.enableUncertaintyQuantification) {
      return {
        id: randomUUID(),
        source: 'model_limitation',
        confidence: predictedConfidence || 0.8,
        reasoning: 'Uncertainty quantification disabled',
        timestamp: Date.now(),
        severity: 'low',
      }
    }

    const assessment: UncertaintyAssessment = {
      id: randomUUID(),
      source: 'model_limitation',
      confidence: predictedConfidence || 0.8,
      reasoning: '',
      timestamp: Date.now(),
      severity: 'low',
    }

    try {
      const prompt = this.buildUncertaintyAssessmentPrompt(task, context)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      })

      const parsed = this.parseUncertaintyResponse(response.content || '')
      assessment.source = parsed.source || 'model_limitation'
      assessment.confidence = parsed.confidence || predictedConfidence || 0.8
      assessment.reasoning = parsed.reasoning || 'Standard assessment'
      assessment.severity = this.calculateSeverity(assessment.confidence)
      assessment.mitigation = parsed.mitigation

      this.uncertaintyHistory.push(assessment)
      this.currentState.overallUncertainty = this.calculateOverallUncertainty()
    } catch (error) {
      assessment.reasoning = `Assessment failed: ${error instanceof Error ? error.message : String(error)}`
      assessment.confidence = 0.5
      assessment.severity = 'medium'
    }

    return assessment
  }

  /**
   * Detect knowledge gaps in current context
   */
  async detectKnowledgeGaps(
    task: string,
    context: Record<string, unknown> = {}
  ): Promise<KnowledgeGap[]> {
    if (!this.config.enableKnowledgeGapDetection) {
      return []
    }

    const detectedGaps: KnowledgeGap[] = []

    try {
      const prompt = this.buildKnowledgeGapDetectionPrompt(task, context)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      })

      const parsed = this.parseKnowledgeGapResponse(response.content || '')
      
      for (const gap of parsed.gaps || []) {
        const knowledgeGap: KnowledgeGap = {
          id: randomUUID(),
          type: gap.type || 'missing_domain_knowledge',
          description: gap.description || 'Unknown gap',
          context: gap.context || task,
          severity: gap.severity || 'medium',
          suggestedAction: gap.suggestedAction || 'Gather more information',
          timestamp: Date.now(),
          resolved: false,
        }

        this.knowledgeGaps.set(knowledgeGap.id, knowledgeGap)
        detectedGaps.push(knowledgeGap)
      }

      this.currentState.activeKnowledgeGaps = detectedGaps.filter(g => !g.resolved)
    } catch (error) {
      console.error('Knowledge gap detection failed:', error)
    }

    return detectedGaps
  }

  /**
   * Perform self-questioning to identify potential issues
   */
  async performSelfQuestioning(
    reasoning: string,
    context: Record<string, unknown> = {}
  ): Promise<string[]> {
    if (!this.config.enableSelfQuestioning) {
      return []
    }

    const questions: string[] = []

    try {
      const prompt = this.buildSelfQuestioningPrompt(reasoning, context)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      })

      const parsed = this.parseSelfQuestioningResponse(response.content || '')
      questions.push(...(parsed.questions || []))

      this.currentState.selfQuestioningActive = questions.length > 0
    } catch (error) {
      console.error('Self-questioning failed:', error)
    }

    return questions
  }

  /**
   * Select adaptive reasoning strategy based on metacognitive state
   */
  async selectReasoningStrategy(
    task: string,
    context: Record<string, unknown> = {}
  ): Promise<string> {
    if (!this.config.enableAdaptiveStrategy) {
      return 'standard'
    }

    try {
      const prompt = this.buildStrategySelectionPrompt(task, context, this.currentState)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      })

      const parsed = this.parseStrategyResponse(response.content || '')
      const strategy = parsed.strategy || 'standard'

      this.currentState.reasoningStrategy = strategy
      return strategy
    } catch (error) {
      console.error('Strategy selection failed:', error)
      return 'standard'
    }
  }

  /**
   * Calibrate confidence based on historical performance
   */
  calibrateConfidence(predictedConfidence: number): number {
    if (this.calibrationHistory.length < 10) {
      return predictedConfidence
    }

    const recentHistory = this.calibrationHistory.slice(-this.config.calibrationWindow)
    const avgBias = recentHistory.reduce((sum, h) => {
      return sum + (h.predictedConfidence - h.actualSuccess)
    }, 0) / recentHistory.length

    // Apply calibration to reduce bias
    const calibrated = Math.max(0, Math.min(1, predictedConfidence - avgBias))
    
    // Update calibration score
    this.currentState.calibrationScore = 1 - Math.abs(avgBias)
    
    return calibrated
  }

  /**
   * Record actual outcome for calibration
   */
  recordOutcome(predictedConfidence: number, actualSuccess: number): void {
    this.calibrationHistory.push({
      predictedConfidence,
      actualSuccess,
      timestamp: Date.now(),
    })

    // Keep only recent history
    if (this.calibrationHistory.length > this.config.calibrationWindow * 2) {
      this.calibrationHistory = this.calibrationHistory.slice(-this.config.calibrationWindow)
    }
  }

  /**
   * Resolve a knowledge gap
   */
  resolveKnowledgeGap(gapId: string): void {
    const gap = this.knowledgeGaps.get(gapId)
    if (gap) {
      gap.resolved = true
      gap.resolvedAt = Date.now()
      this.currentState.activeKnowledgeGaps = this.currentState.activeKnowledgeGaps.filter(
        g => g.id !== gapId
      )
    }
  }

  /**
   * Get current metacognitive state
   */
  getMetacognitiveState(): MetacognitiveState {
    return { ...this.currentState }
  }

  /**
   * Get uncertainty history
   */
  getUncertaintyHistory(filter?: {
    source?: UncertaintySource
    since?: number
    severity?: 'low' | 'medium' | 'high'
  }): UncertaintyAssessment[] {
    let history = [...this.uncertaintyHistory]

    if (filter) {
      if (filter.source) {
        history = history.filter(u => u.source === filter.source)
      }
      if (filter.since) {
        history = history.filter(u => u.timestamp >= filter.since!)
      }
      if (filter.severity) {
        history = history.filter(u => u.severity === filter.severity)
      }
    }

    return history.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get knowledge gaps
   */
  getKnowledgeGaps(includeResolved: boolean = false): KnowledgeGap[] {
    const gaps = Array.from(this.knowledgeGaps.values())
    
    if (!includeResolved) {
      return gaps.filter(g => !g.resolved).sort((a, b) => b.timestamp - a.timestamp)
    }

    return gaps.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get calibration statistics
   */
  getCalibrationStats(): {
    sampleSize: number
    averageBias: number
    calibrationScore: number
    confidenceAccuracy: number
  } {
    if (this.calibrationHistory.length === 0) {
      return {
        sampleSize: 0,
        averageBias: 0,
        calibrationScore: 0,
        confidenceAccuracy: 0,
      }
    }

    const avgBias = this.calibrationHistory.reduce((sum, h) => 
      sum + (h.predictedConfidence - h.actualSuccess), 0
    ) / this.calibrationHistory.length

    const calibrationScore = 1 - Math.abs(avgBias)
    const accuracy = this.calibrationHistory.filter(h => 
      Math.abs(h.predictedConfidence - h.actualSuccess) < 0.2
    ).length / this.calibrationHistory.length

    return {
      sampleSize: this.calibrationHistory.length,
      averageBias: avgBias,
      calibrationScore,
      confidenceAccuracy: accuracy,
    }
  }

  /**
   * Assess emotional state based on recent performance and context
   */
  async assessEmotionalState(
    task: string,
    context: Record<string, unknown> = {}
  ): Promise<EmotionalState> {
    try {
      const prompt = this.buildEmotionalAssessmentPrompt(task, context, this.currentState)
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      })

      const parsed = this.parseEmotionalResponse(response.content || '')
      this.currentState.emotionalState = parsed.state || 'neutral'
      
      // Update cognitive load based on emotional state
      this.updateCognitiveLoad()
      
      return this.currentState.emotionalState
    } catch (error) {
      console.error('Emotional assessment failed:', error)
      return 'neutral'
    }
  }

  /**
   * Update cognitive load based on various factors
   */
  private updateCognitiveLoad(): void {
    const factors = {
      uncertainty: this.currentState.overallUncertainty,
      knowledgeGaps: this.currentState.activeKnowledgeGaps.length,
      emotionalStress: this.currentState.emotionalState === 'frustrated' ? 0.8 : 
                       this.currentState.emotionalState === 'uncertain' ? 0.5 : 0.2,
      complexity: this.uncertaintyHistory.length > 10 ? 0.6 : 0.3,
    }

    const cognitiveLoad = (
      factors.uncertainty * 0.3 +
      Math.min(factors.knowledgeGaps / 10, 1) * 0.3 +
      factors.emotionalStress * 0.2 +
      factors.complexity * 0.2
    )

    this.currentState.cognitiveLoad = Math.min(1, Math.max(0, cognitiveLoad))
    
    // Update attention focus inversely to cognitive load
    this.currentState.attentionFocus = Math.max(0.3, 1 - cognitiveLoad)
  }

  /**
   * Apply emotional regulation strategies
   */
  async applyEmotionalRegulation(): Promise<void> {
    if (this.currentState.emotionalState === 'frustrated') {
      // Reduce cognitive load, suggest break or simplification
      this.currentState.cognitiveLoad = Math.max(0.3, this.currentState.cognitiveLoad - 0.2)
      this.currentState.reasoningStrategy = 'conservative'
    } else if (this.currentState.emotionalState === 'confident' && this.currentState.cognitiveLoad > 0.7) {
      // Overconfidence with high load - add caution
      this.currentState.emotionalState = 'cautious'
      this.currentState.reasoningStrategy = 'analytical'
    } else if (this.currentState.emotionalState === 'uncertain') {
      // Increase self-questioning
      this.currentState.selfQuestioningActive = true
    }
  }

  /**
   * Detect cognitive biases in reasoning
   */
  async detectCognitiveBiases(
    reasoning: string,
    context: Record<string, unknown> = {}
  ): Promise<Array<{ bias: string; description: string; severity: 'low' | 'medium' | 'high' }>> {
    try {
      const prompt = `Reasoning: ${reasoning}\n\nContext: ${JSON.stringify(context)}\n\nIdentify potential cognitive biases (e.g., confirmation bias, anchoring, availability heuristic, overconfidence). Return JSON: { "biases": [{"bias": "bias name", "description": "explanation", "severity": "low|medium|high"}] }`
      
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      })

      const parsed = this.parseBiasResponse(response.content || '')
      return parsed.biases || []
    } catch (error) {
      console.error('Bias detection failed:', error)
      return []
    }
  }

  /**
   * Generate metacognitive reflection
   */
  async generateMetacognitiveReflection(
    task: string,
    outcome: string,
    context: Record<string, unknown> = {}
  ): Promise<{
    reflection: string
    lessonsLearned: string[]
    improvements: string[]
  }> {
    try {
      const prompt = `Task: ${task}\n\nOutcome: ${outcome}\n\nContext: ${JSON.stringify(context)}\n\nCurrent State:\n- Confidence: ${this.currentState.currentConfidence}\n- Uncertainty: ${this.currentState.overallUncertainty}\n- Emotional State: ${this.currentState.emotionalState}\n- Calibration: ${this.currentState.calibrationScore}\n\nGenerate a metacognitive reflection. Return JSON: { "reflection": "overall reflection", "lessonsLearned": ["lesson1", "lesson2"], "improvements": ["improvement1", "improvement2"] }`
      
      const response = await chatComplete({
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      })

      return this.parseReflectionResponse(response.content || '')
    } catch (error) {
      console.error('Reflection generation failed:', error)
      return {
        reflection: 'Unable to generate reflection',
        lessonsLearned: [],
        improvements: [],
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Helper Methods                                                     */
/* ------------------------------------------------------------------ */

  private calculateSeverity(confidence: number): 'low' | 'medium' | 'high' {
    if (confidence < 0.4) return 'high'
    if (confidence < 0.7) return 'medium'
    return 'low'
  }

  private calculateOverallUncertainty(): number {
    if (this.uncertaintyHistory.length === 0) {
      return 0
    }

    const recent = this.uncertaintyHistory.slice(-20)
    const avgConfidence = recent.reduce((sum, u) => sum + u.confidence, 0) / recent.length
    return 1 - avgConfidence
  }

  private getSystemPrompt(): string {
    return `You are a metacognitive reasoning engine that analyzes uncertainty and knowledge gaps.

GUIDELINES:
- Identify sources of uncertainty in reasoning tasks
- Detect missing knowledge or context
- Generate self-reflective questions
- Suggest appropriate reasoning strategies
- Provide clear severity assessments`
  }

  private buildUncertaintyAssessmentPrompt(
    task: string,
    context: Record<string, unknown>
  ): string {
    let prompt = `Task: ${task}\n\n`
    
    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    prompt += `Assess the uncertainty of this task. Return JSON:
{
  "source": "knowledge_gap|ambiguous_input|insufficient_context|conflicting_information|complex_dependency|temporal_uncertainty|model_limitation",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of uncertainty assessment",
  "mitigation": "suggested mitigation strategy"
}`

    return prompt
  }

  private buildKnowledgeGapDetectionPrompt(
    task: string,
    context: Record<string, unknown>
  ): string {
    let prompt = `Task: ${task}\n\n`
    
    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    prompt += `Identify knowledge gaps. Return JSON:
{
  "gaps": [
    {
      "type": "missing_domain_knowledge|missing_context|outdated_information|insufficient_data|unknown_dependency",
      "description": "gap description",
      "context": "context where gap exists",
      "severity": "low|medium|high",
      "suggestedAction": "action to resolve gap"
    }
  ]
}`

    return prompt
  }

  private buildSelfQuestioningPrompt(
    reasoning: string,
    context: Record<string, unknown>
  ): string {
    let prompt = `Reasoning: ${reasoning}\n\n`
    
    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    prompt += `Generate self-reflective questions to identify potential issues. Return JSON:
{
  "questions": [
    "question1",
    "question2"
  ]
}`

    return prompt
  }

  private buildStrategySelectionPrompt(
    task: string,
    context: Record<string, unknown>,
    state: MetacognitiveState
  ): string {
    let prompt = `Task: ${task}\n\n`
    prompt += `Current State:\n`
    prompt += `- Confidence: ${state.currentConfidence}\n`
    prompt += `- Uncertainty: ${state.overallUncertainty}\n`
    prompt += `- Active Gaps: ${state.activeKnowledgeGaps.length}\n`
    prompt += `- Calibration: ${state.calibrationScore}\n\n`
    
    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    prompt += `Select the best reasoning strategy. Return JSON:
{
  "strategy": "standard|conservative|aggressive|analytical|creative",
  "reasoning": "why this strategy is appropriate"
}`

    return prompt
  }

  private parseUncertaintyResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      return {}
    }
  }

  private parseKnowledgeGapResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { gaps: [] }
    } catch {
      return { gaps: [] }
    }
  }

  private parseSelfQuestioningResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [] }
    } catch {
      return { questions: [] }
    }
  }

  private parseStrategyResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { strategy: 'standard' }
    } catch {
      return { strategy: 'standard' }
    }
  }

  private buildEmotionalAssessmentPrompt(
    task: string,
    context: Record<string, unknown>,
    state: MetacognitiveState
  ): string {
    let prompt = `Task: ${task}\n\n`
    prompt += `Current State:\n`
    prompt += `- Confidence: ${state.currentConfidence}\n`
    prompt += `- Uncertainty: ${state.overallUncertainty}\n`
    prompt += `- Cognitive Load: ${state.cognitiveLoad}\n`
    prompt += `- Active Gaps: ${state.activeKnowledgeGaps.length}\n\n`
    
    if (Object.keys(context).length > 0) {
      prompt += `Context:\n${JSON.stringify(context, null, 2)}\n\n`
    }

    prompt += `Assess the appropriate emotional state. Return JSON: { "state": "neutral|confident|uncertain|curious|cautious|frustrated|optimistic", "reasoning": "explanation" }`

    return prompt
  }

  private parseEmotionalResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { state: 'neutral' }
    } catch {
      return { state: 'neutral' }
    }
  }

  private parseBiasResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { biases: [] }
    } catch {
      return { biases: [] }
    }
  }

  private parseReflectionResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { reflection: '', lessonsLearned: [], improvements: [] }
    } catch {
      return { reflection: '', lessonsLearned: [], improvements: [] }
    }
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.uncertaintyHistory = []
    this.knowledgeGaps.clear()
    this.calibrationHistory = []
    this.currentState = this.initializeState()
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton Instance                                                 */
/* ------------------------------------------------------------------ */

const metaCognitionEngine = new MetaCognitionEngine()

export { metaCognitionEngine }

// Alias for backward compatibility
export { MetaCognitionEngine as MetaCognition }