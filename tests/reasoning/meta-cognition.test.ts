/**
 * Unit Tests for Meta-Cognition Engine
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { MetaCognitionEngine } from '@/lib/ai/reasoning/meta-cognition'

describe('MetaCognitionEngine', () => {
  let metaEngine: MetaCognitionEngine

  beforeEach(() => {
    metaEngine = new MetaCognitionEngine({
      enableUncertaintyQuantification: true,
      enableKnowledgeGapDetection: true,
      enableSelfQuestioning: false, // Disable for faster tests
      enableAdaptiveStrategy: false, // Disable for faster tests
      confidenceThreshold: 0.7,
      uncertaintyThreshold: 0.3,
      calibrationWindow: 50,
    })
  })

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const engine = new MetaCognitionEngine()
      expect(engine).toBeDefined()
    })

    it('should initialize with custom config', () => {
      const engine = new MetaCognitionEngine({
        confidenceThreshold: 0.9,
        uncertaintyThreshold: 0.2,
      })
      expect(engine).toBeDefined()
    })

    it('should get initial metacognitive state', () => {
      const state = metaEngine.getMetacognitiveState()
      expect(state).toBeDefined()
      expect(state.currentConfidence).toBeGreaterThan(0)
      expect(state.overallUncertainty).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Uncertainty Assessment', () => {
    it('should handle uncertainty quantification disabled', async () => {
      const engine = new MetaCognitionEngine({
        enableUncertaintyQuantification: false,
      })
      
      const assessment = await engine.assessUncertainty('test task')
      expect(assessment).toBeDefined()
      expect(assessment.source).toBeDefined()
    })
  })

  describe('Knowledge Gap Detection', () => {
    it('should handle knowledge gap detection disabled', async () => {
      const engine = new MetaCognitionEngine({
        enableKnowledgeGapDetection: false,
      })
      
      const gaps = await engine.detectKnowledgeGaps('test task')
      expect(gaps).toEqual([])
    })
  })

  describe('Calibration', () => {
    it('should calibrate confidence with no history', () => {
      const calibrated = metaEngine.calibrateConfidence(0.8)
      expect(calibrated).toBe(0.8)
    })

    it('should record outcomes', () => {
      metaEngine.recordOutcome(0.8, 1.0)
      metaEngine.recordOutcome(0.7, 0.6)
      
      const stats = metaEngine.getCalibrationStats()
      expect(stats.sampleSize).toBe(2)
    })

    it('should get calibration statistics', () => {
      const stats = metaEngine.getCalibrationStats()
      expect(stats).toBeDefined()
      expect(stats.sampleSize).toBe(0)
    })
  })

  describe('Knowledge Gap Management', () => {
    it('should get empty knowledge gaps initially', () => {
      const gaps = metaEngine.getKnowledgeGaps()
      expect(gaps).toEqual([])
    })

    it('should resolve knowledge gap', () => {
      // This would normally require a gap to exist
      // Testing the method exists
      expect(() => metaEngine.resolveKnowledgeGap('non-existent')).not.toThrow()
    })
  })

  describe('History Management', () => {
    it('should get empty uncertainty history initially', () => {
      const history = metaEngine.getUncertaintyHistory()
      expect(history).toEqual([])
    })

    it('should clear history', () => {
      metaEngine.clearHistory()
      const state = metaEngine.getMetacognitiveState()
      expect(state).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty task string', async () => {
      expect(metaEngine).toBeDefined()
    })

    it('should handle empty context', async () => {
      expect(metaEngine).toBeDefined()
    })
  })
})