/**
 * Advanced Reasoning Module
 * 
 * Exports all reasoning components:
 * - Chain-of-Thought Engine
 * - Meta-Cognition Engine
 * - Reasoning Trace System
 */

export {
  ChainOfThoughtEngine,
  cotEngine,
  type CoTConfig,
  type CoTResult,
  type Thought,
  type ThoughtStatus,
  type ThoughtType,
  type ReasoningStep,
} from './chain-of-thought'

export {
  MetaCognitionEngine,
  metaCognitionEngine,
  type MetacognitiveConfig,
  type MetacognitiveState,
  type UncertaintyAssessment,
  type UncertaintySource,
  type KnowledgeGap,
  type KnowledgeGapType,
} from './meta-cognition'

export {
  ReasoningTraceSystem,
  reasoningTraceSystem,
  type TraceEvent,
  type TraceEventType,
  type TraceFilter,
  type DecisionNode,
  type ReasoningTrace,
} from './reasoning-trace'