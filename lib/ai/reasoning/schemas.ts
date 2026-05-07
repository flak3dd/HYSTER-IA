/**
 * Reasoning Output Schemas
 *
 * Zod schemas for all structured outputs from the reasoning engines.
 * Replaces the regex-based `response.match(/\{[\s\S]*\}/)` JSON extraction
 * with proper structured output via generateObject().
 */

import { z } from 'zod'

// ============================================================
// Chain-of-Thought Schemas
// ============================================================

export const DecompositionSchema = z.object({
  subProblems: z.array(z.object({
    id: z.string().describe('Unique identifier for this sub-problem'),
    description: z.string().describe('Description of the sub-problem'),
    estimatedSteps: z.number().min(1).describe('Estimated number of steps to solve'),
    dependencies: z.array(z.string()).describe('IDs of sub-problems this depends on'),
    priority: z.enum(['high', 'medium', 'low']).describe('Priority level'),
  })).describe('Decomposed sub-problems'),
  estimatedSteps: z.number().min(1).describe('Total estimated steps for the full problem'),
  reasoningStrategy: z.enum(['sequential', 'parallel', 'hybrid']).describe('Recommended reasoning strategy'),
})

export const ThoughtAnalysisSchema = z.object({
  analysis: z.string().min(1).describe('The analysis or reasoning content'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  keyInsights: z.array(z.string()).describe('Key insights discovered. Empty array if none.'),
  assumptions: z.array(z.string()).describe('Assumptions made. Empty array if none.'),
  risks: z.array(z.string()).describe('Risks identified. Empty array if none.'),
})

export const VerificationSchema = z.object({
  isConsistent: z.boolean().describe('Whether the reasoning is self-consistent'),
  contradictions: z.array(z.string()).describe('Any contradictions found'),
  corrections: z.array(z.string()).describe('Suggested corrections'),
  confidenceAdjustment: z.number().min(-1).max(1).describe('Adjustment to confidence score'),
})

export const SynthesisSchema = z.object({
  finalAnswer: z.string().min(1).describe('The synthesized final answer'),
  confidence: z.number().min(0).max(1).describe('Overall confidence in the answer'),
  keyFindings: z.array(z.string()).describe('Key findings that led to this answer'),
  limitations: z.array(z.string()).describe('Limitations or caveats'),
})

// ============================================================
// Meta-Cognition Schemas
// ============================================================

export const UncertaintyAssessmentSchema = z.object({
  source: z.enum([
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
  ]).describe('Source of uncertainty'),
  confidence: z.number().min(0).max(1).describe('Confidence in this assessment'),
  reasoning: z.string().describe('Why this uncertainty exists'),
  severity: z.enum(['low', 'medium', 'high']).describe('Severity of the uncertainty'),
  mitigation: z.string().describe('Suggested mitigation strategy. Empty string if none.'),
})

export const KnowledgeGapSchema = z.object({
  gaps: z.array(z.object({
    type: z.enum([
      'missing_domain_knowledge',
      'missing_context',
      'outdated_information',
      'insufficient_data',
      'unknown_dependency',
    ]).describe('Type of knowledge gap'),
    description: z.string().describe('Description of the gap'),
    severity: z.enum(['low', 'medium', 'high']).describe('Severity of the gap'),
    suggestedAction: z.string().describe('Action to resolve the gap'),
  })).describe('Detected knowledge gaps'),
})

export const SelfQuestioningSchema = z.object({
  questions: z.array(z.object({
    question: z.string().describe('The self-questioning prompt'),
    purpose: z.string().describe('Why this question matters'),
    expectedAnswer: z.string().describe('What the answer might look like. Empty string if unknown.'),
  })).describe('Self-generated questions to validate reasoning'),
})

export const StrategySelectionSchema = z.object({
  strategy: z.enum([
    'standard',
    'conservative',
    'aggressive',
    'exploratory',
    'systematic',
  ]).describe('Selected reasoning strategy'),
  rationale: z.string().describe('Why this strategy was chosen'),
  expectedDepth: z.number().min(1).max(10).describe('Expected reasoning depth'),
  focusAreas: z.array(z.string()).describe('Areas to focus on'),
})

export const EmotionalStateSchema = z.object({
  state: z.enum([
    'neutral',
    'confident',
    'uncertain',
    'curious',
    'cautious',
    'frustrated',
    'optimistic',
  ]).describe('Current emotional/cognitive state'),
  confidence: z.number().min(0).max(1).describe('Confidence in state assessment'),
  factors: z.array(z.string()).describe('Factors influencing this state'),
})

export const BiasDetectionSchema = z.object({
  biases: z.array(z.object({
    type: z.string().describe('Type of cognitive bias detected'),
    description: z.string().describe('How the bias manifests'),
    severity: z.enum(['low', 'medium', 'high']).describe('Severity of the bias'),
    mitigation: z.string().describe('How to mitigate this bias'),
  })).describe('Detected cognitive biases'),
})

export const ReflectionSchema = z.object({
  reflection: z.string().describe('Self-reflection on the reasoning process'),
  lessonsLearned: z.array(z.string()).describe('Lessons learned from this reasoning session'),
  improvements: z.array(z.string()).describe('Suggested improvements for future reasoning'),
  overallQuality: z.enum(['excellent', 'good', 'adequate', 'poor']).describe('Overall quality assessment'),
})

// ============================================================
// Intent Analysis Schema
// Cross-provider compatible: no z.record(), no .optional()
// ============================================================

export const IntentAnalysisSchema = z.object({
  intent: z.string().min(1).describe('The detected user intent'),
  confidence: z.number().min(0).max(1).describe('Confidence in intent detection'),
  parameterKeys: z.array(z.string()).describe('Names of extracted parameters. Empty array if none.'),
  parameterValues: z.array(z.string()).describe('String values for extracted parameters (same order as parameterKeys). Empty array if none.'),
  suggestedFunction: z.string().describe('Suggested backend function to call. Empty string if none.'),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('Risk level of the operation'),
  requiresConfirmation: z.boolean().describe('Whether user confirmation is needed'),
  reasoning: z.string().describe('Reasoning behind the intent classification. Empty string if none.'),
})
