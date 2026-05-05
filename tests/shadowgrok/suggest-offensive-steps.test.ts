/**
 * ShadowGrok Suggest Next Offensive Steps Tests
 * Tests for the offensive suggestion functionality
 */

import { executeTool } from '@/lib/grok/tool-executor'

describe('suggest_next_offensive_steps', () => {
  it('should generate stealth persona suggestions', async () => {
    const result = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'stealth',
        risk_tolerance: 'medium',
        focus_area: 'all',
        include_context: false,
        max_suggestions: 3
      },
      {
        userId: 'test-user',
        conversationId: 'test-conversation',
      }
    )

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data.suggestions).toBeInstanceOf(Array)
    expect(result.data.suggestions.length).toBeGreaterThan(0)
    expect(result.data.suggestions.length).toBeLessThanOrEqual(3)
    
    const firstSuggestion = result.data.suggestions[0]
    expect(firstSuggestion.action).toBeDefined()
    expect(firstSuggestion.reasoning).toBeDefined()
    expect(firstSuggestion.estimated_risk).toBeDefined()
    expect(firstSuggestion.priority_score).toBeDefined()
    expect(firstSuggestion.tools_required).toBeInstanceOf(Array)
    expect(firstSuggestion.category).toBeDefined()
  })

  it('should generate aggressive persona suggestions', async () => {
    const result = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'aggressive',
        risk_tolerance: 'high',
        focus_area: 'operations',
        include_context: false,
        max_suggestions: 2
      },
      {
        userId: 'test-user',
      }
    )

    expect(result.success).toBe(true)
    expect(result.data.suggestions.length).toBeGreaterThan(0)
    
    result.data.suggestions.forEach((suggestion: any) => {
      expect(suggestion.category).toBe('operations')
    })
  })

  it('should generate exfil persona suggestions', async () => {
    const result = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'exfil',
        risk_tolerance: 'low',
        focus_area: 'all',
        include_context: false,
        max_suggestions: 3
      },
      {
        userId: 'test-user',
      }
    )

    expect(result.success).toBe(true)
    expect(result.data.suggestions.length).toBeGreaterThan(0)
  })

  it('should generate destruction persona suggestions', async () => {
    const result = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'destruction',
        risk_tolerance: 'high',
        focus_area: 'all',
        include_context: false,
        max_suggestions: 3
      },
      {
        userId: 'test-user',
      }
    )

    expect(result.success).toBe(true)
    expect(result.data.suggestions.length).toBeGreaterThan(0)
  })

  it('should respect max_suggestions parameter', async () => {
    const result = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'stealth',
        max_suggestions: 2
      },
      {
        userId: 'test-user',
      }
    )

    expect(result.success).toBe(true)
    expect(result.data.suggestions.length).toBeLessThanOrEqual(2)
  })

  it('should filter by focus_area', async () => {
    const result = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'stealth',
        focus_area: 'implant',
        max_suggestions: 10
      },
      {
        userId: 'test-user',
      }
    )

    expect(result.success).toBe(true)
    result.data.suggestions.forEach((suggestion: any) => {
      expect(suggestion.category).toBe('implant')
    })
  })

  it('should adjust priority based on risk_tolerance', async () => {
    const lowRiskResult = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'stealth',
        risk_tolerance: 'low',
        max_suggestions: 5
      },
      {
        userId: 'test-user',
      }
    )

    const highRiskResult = await executeTool(
      'suggest_next_offensive_steps',
      {
        persona: 'stealth',
        risk_tolerance: 'high',
        max_suggestions: 5
      },
      {
        userId: 'test-user',
      }
    )

    expect(lowRiskResult.success).toBe(true)
    expect(highRiskResult.success).toBe(true)
    
    // High risk tolerance should result in higher priority scores
    const lowRiskAvgPriority = lowRiskResult.data.suggestions.reduce((sum: number, s: any) => sum + s.priority_score, 0) / lowRiskResult.data.suggestions.length
    const highRiskAvgPriority = highRiskResult.data.suggestions.reduce((sum: number, s: any) => sum + s.priority_score, 0) / highRiskResult.data.suggestions.length
    
    expect(highRiskAvgPriority).toBeGreaterThan(lowRiskAvgPriority)
  })
})