/**
 * Unit Tests for Reasoning Trace System
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { ReasoningTraceSystem } from '@/lib/ai/reasoning/reasoning-trace'

describe('ReasoningTraceSystem', () => {
  let traceSystem: ReasoningTraceSystem

  beforeEach(() => {
    traceSystem = new ReasoningTraceSystem()
  })

  describe('Initialization', () => {
    it('should initialize', () => {
      expect(traceSystem).toBeDefined()
    })

    it('should clear all traces', () => {
      traceSystem.clearAll()
      const stats = traceSystem.getStatistics()
      expect(stats.totalTraces).toBe(0)
    })
  })

  describe('Session Management', () => {
    it('should start a new session', () => {
      const sessionId = traceSystem.startSession()
      expect(sessionId).toBeDefined()
      expect(typeof sessionId).toBe('string')
    })

    it('should start session with custom ID', () => {
      const customId = 'custom-session-123'
      const sessionId = traceSystem.startSession(customId)
      expect(sessionId).toBe(customId)
    })

    it('should end session and return trace', () => {
      traceSystem.startSession()
      const trace = traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      expect(trace).toBeDefined()
      expect(trace?.finalDecision.action).toBe('test_action')
    })

    it('should return null when ending session without starting', () => {
      const trace = traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      expect(trace).toBeNull()
    })
  })

  describe('Event Logging', () => {
    it('should log event in active session', () => {
      traceSystem.startSession()
      expect(() => {
        traceSystem.logEvent('reasoning_start', { test: 'data' })
      }).not.toThrow()
    })

    it('should not log event without active session', () => {
      expect(() => {
        traceSystem.logEvent('reasoning_start', { test: 'data' })
      }).not.toThrow() // Should not throw, just warn
    })
  })

  describe('Trace Retrieval', () => {
    it('should get trace by ID', () => {
      traceSystem.startSession()
      const trace = traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      
      if (trace) {
        const retrieved = traceSystem.getTrace(trace.id)
        expect(retrieved).toBeDefined()
        expect(retrieved?.id).toBe(trace.id)
      }
    })

    it('should return undefined for non-existent trace', () => {
      const retrieved = traceSystem.getTrace('non-existent-id')
      expect(retrieved).toBeUndefined()
    })

    it('should get traces by session ID', () => {
      const sessionId = traceSystem.startSession()
      traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      
      const traces = traceSystem.getTracesBySession(sessionId)
      expect(traces).toHaveLength(1)
    })
  })

  describe('Statistics', () => {
    it('should get statistics with no traces', () => {
      const stats = traceSystem.getStatistics()
      expect(stats).toBeDefined()
      expect(stats.totalTraces).toBe(0)
      expect(stats.totalEvents).toBe(0)
    })

    it('should get statistics with traces', () => {
      traceSystem.startSession()
      traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      
      const stats = traceSystem.getStatistics()
      expect(stats.totalTraces).toBe(1)
    })
  })

  describe('Trace Export', () => {
    it('should export trace as JSON', () => {
      traceSystem.startSession()
      const trace = traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      
      if (trace) {
        const exported = traceSystem.exportTrace(trace.id)
        expect(exported).toBeDefined()
        expect(typeof exported).toBe('string')
      }
    })

    it('should return null when exporting non-existent trace', () => {
      const exported = traceSystem.exportTrace('non-existent-id')
      expect(exported).toBeNull()
    })

    it('should export decision tree as DOT', () => {
      traceSystem.startSession()
      const trace = traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      
      if (trace) {
        const dot = traceSystem.exportDecisionTree(trace.id)
        expect(dot).toBeDefined()
        expect(typeof dot).toBe('string')
      }
    })
  })

  describe('Trace Cleanup', () => {
    it('should clear old traces', () => {
      traceSystem.startSession()
      traceSystem.endSession({
        action: 'test_action',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      })
      
      traceSystem.clearOldTraces(0) // Clear all
      const stats = traceSystem.getStatistics()
      expect(stats.totalTraces).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple sessions', () => {
      traceSystem.startSession('session-1')
      traceSystem.endSession({
        action: 'action1',
        confidence: 0.8,
        reasoning: 'reasoning1',
      })
      
      traceSystem.startSession('session-2')
      traceSystem.endSession({
        action: 'action2',
        confidence: 0.9,
        reasoning: 'reasoning2',
      })
      
      const stats = traceSystem.getStatistics()
      expect(stats.totalTraces).toBe(2)
    })
  })
})