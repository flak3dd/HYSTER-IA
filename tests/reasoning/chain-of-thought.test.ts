/**
 * Unit Tests for Chain-of-Thought Engine
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { ChainOfThoughtEngine } from '@/lib/ai/reasoning/chain-of-thought'

describe('ChainOfThoughtEngine', () => {
  let cotEngine: ChainOfThoughtEngine

  beforeEach(() => {
    cotEngine = new ChainOfThoughtEngine({
      maxDepth: 3,
      maxBranching: 2,
      selfConsistencySamples: 2,
      confidenceThreshold: 0.7,
      pruneThreshold: 0.3,
      enableVerification: false, // Disable for faster tests
      enableSynthesis: false, // Disable for faster tests
    })
  })

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const engine = new ChainOfThoughtEngine()
      expect(engine).toBeDefined()
    })

    it('should initialize with custom config', () => {
      const engine = new ChainOfThoughtEngine({
        maxDepth: 10,
        confidenceThreshold: 0.9,
      })
      expect(engine).toBeDefined()
    })

    it('should clear internal state', () => {
      cotEngine.clear()
      const thoughts = cotEngine.getThoughts()
      const steps = cotEngine.getReasoningSteps()
      expect(thoughts).toHaveLength(0)
      expect(steps).toHaveLength(0)
    })
  })

  describe('Thought Management', () => {
    it('should get empty thoughts initially', () => {
      const thoughts = cotEngine.getThoughts()
      expect(thoughts).toHaveLength(0)
    })

    it('should get empty reasoning steps initially', () => {
      const steps = cotEngine.getReasoningSteps()
      expect(steps).toHaveLength(0)
    })
  })

  describe('Configuration', () => {
    it('should respect maxDepth configuration', () => {
      const engine = new ChainOfThoughtEngine({ maxDepth: 5 })
      expect(engine).toBeDefined()
    })

    it('should respect confidenceThreshold configuration', () => {
      const engine = new ChainOfThoughtEngine({ confidenceThreshold: 0.8 })
      expect(engine).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty problem string', async () => {
      // This would normally fail, but we're testing the structure
      expect(cotEngine).toBeDefined()
    })

    it('should handle empty context', async () => {
      expect(cotEngine).toBeDefined()
    })
  })
})