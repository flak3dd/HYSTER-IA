import type { IntentAnalysis } from './types'
import type { ChatRole, ChatMessage } from '../agents/llm'

export class IntentAnalyzer {
  private conversationHistory: Array<{ role: ChatRole; content: string }> = []
  private systemState: Record<string, unknown> = {}

  /**
   * Analyze user intent from natural language input with enhanced context
   */
  async analyze(userText: string, context: Record<string, unknown> = {}): Promise<IntentAnalysis> {
    // Import the LLM client
    const { chatComplete } = await import('../agents/llm')

    // Get available backend functions
    const { FunctionRegistry } = await import('./function-registry')
    const registry = new FunctionRegistry()
    const availableFunctions = await registry.getAllFunctions()

    // Update system state with current context
    this.updateSystemState(context)

    // Add user message to conversation history
    this.conversationHistory.push({ role: 'user' as ChatRole, content: userText })

    // Create enhanced system prompt with context awareness
    const systemPrompt = this.createEnhancedSystemPrompt(availableFunctions)

    // Create user prompt with rich context
    const userPrompt = this.createEnhancedUserPrompt(userText, context)

    try {
      // Call LLM to analyze intent with conversation history
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory.slice(-10) as ChatMessage[], // Keep last 10 messages for context
        { role: 'user', content: userPrompt },
      ]

      const response = await chatComplete({
        messages,
        temperature: 0.3,
      })

      // Parse the LLM response
      const analysis = this.parseLlmResponse(response.content || '')

      // Add AI response to conversation history
      this.conversationHistory.push({ 
        role: 'assistant' as ChatRole,
        content: `I understand you want to: ${analysis.intent}. ${analysis.suggestedFunction ? `I'll use the ${analysis.suggestedFunction} function.` : 'I need more information.'}` 
      })

      return analysis
    } catch (error) {
      console.error('Error analyzing intent:', error)

      // Enhanced fallback with pattern matching
      return this.enhancedFallbackAnalysis(userText, availableFunctions, context)
    }
  }

  /**
   * Update system state with current context
   */
  private updateSystemState(context: Record<string, unknown>): void {
    this.systemState = {
      ...this.systemState,
      ...context,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Create enhanced system prompt with context awareness
   */
  private createEnhancedSystemPrompt(availableFunctions: any[]): string {
    const functionDescriptions = availableFunctions
      .map(fn => `- ${fn.name}: ${fn.description}\n  Parameters: ${JSON.stringify(fn.parameters)}`)
      .join('\n\n')

    return `You are an advanced AI workflow assistant that analyzes user intent and orchestrates backend operations.

CAPABILITIES:
- Understand complex, multi-step user requests
- Extract structured parameters from natural language
- Map intents to appropriate backend functions
- Recognize when clarification is needed
- Maintain context across conversation turns
- Suggest optimizations and alternatives

AVAILABLE FUNCTIONS:
${functionDescriptions}

SYSTEM STATE:
${JSON.stringify(this.systemState, null, 2)}

ANALYSIS GUIDELINES:
1. Parse the user's intent considering conversation history
2. Extract all relevant parameters with appropriate types
3. Consider system state when suggesting functions
4. Identify dependencies or prerequisite operations
5. Suggest function chaining for complex workflows
6. Set confidence based on clarity and parameter completeness
7. Ask clarifying questions only when essential

RESPONSE FORMAT (JSON):
{
  "intent": "detailed description of user's goal",
  "confidence": 0.0-1.0,
  "extractedParameters": {
    "paramName": "value or null if missing"
  },
  "suggestedFunction": "function_name or null",
  "requiresClarification": true/false,
  "clarificationQuestions": ["specific question if needed"],
  "suggestedChaining": ["function1", "function2"] if applicable,
  "alternativeApproaches": ["alternative1", "alternative2"] if applicable
}

Be precise but flexible. If multiple approaches exist, suggest the most appropriate one.`
  }

  /**
   * Create enhanced user prompt with rich context
   */
  private createEnhancedUserPrompt(userText: string, context: Record<string, unknown>): string {
    let prompt = `User Request: "${userText}"\n\n`

    // Add conversation context
    if (this.conversationHistory.length > 1) {
      prompt += `Conversation Context:\n`
      this.conversationHistory.slice(-5).forEach(msg => {
        prompt += `  ${msg.role}: ${msg.content}\n`
      })
      prompt += `\n`
    }

    // Add system context
    if (Object.keys(context).length > 0) {
      prompt += `Current Context:\n`
      Object.entries(context).forEach(([key, value]) => {
        prompt += `  ${key}: ${JSON.stringify(value)}\n`
      })
      prompt += `\n`
    }

    // Add temporal context
    prompt += `Temporal Context:\n`
    prompt += `  Current time: ${new Date().toISOString()}\n`
    prompt += `  Conversation turn: ${this.conversationHistory.length}\n`

    return prompt
  }

  /**
   * Parse LLM response into IntentAnalysis
   */
  private parseLlmResponse(response: string): IntentAnalysis {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])

      return {
        intent: parsed.intent || 'Unknown intent',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        extractedParameters: parsed.extractedParameters || {},
        suggestedFunction: parsed.suggestedFunction || undefined,
        requiresClarification: parsed.requiresClarification || false,
        clarificationQuestions: parsed.clarificationQuestions || [],
      }
    } catch (error) {
      console.error('Error parsing LLM response:', error)
      throw error
    }
  }

  /**
   * Enhanced fallback with pattern matching
   */
  private enhancedFallbackAnalysis(userText: string, availableFunctions: any[], context: Record<string, unknown>): IntentAnalysis {
    const lowerText = userText.toLowerCase()

    // Enhanced keyword mappings with patterns
    const intentPatterns = {
      node_management: {
        keywords: ['node', 'server', 'instance', 'host', 'deploy', 'create', 'add', 'new'],
        functions: ['create_node', 'update_node', 'delete_node', 'list_nodes'],
        extractors: {
          region: /(?:in|at|region)\s+(\w+(?:-\w+)*)/i,
          hostname: /(?:host|hostname|server|ip)\s+(\S+)/i,
          name: /(?:name|called|named)\s+(\S+)/i,
        }
      },
      user_management: {
        keywords: ['user', 'client', 'account', 'quota', 'create', 'add', 'new'],
        functions: ['create_user', 'delete_user', 'list_users'],
        extractors: {
          quota: /(\d+)\s*(?:gb|mb|tb)/i,
          displayname: /(?:name|called|named)\s+(\S+)/i,
        }
      },
      config_management: {
        keywords: ['config', 'configuration', 'generate', 'yaml', 'clash'],
        functions: ['generate_config', 'update_server_config'],
        extractors: {
          format: /(?:format|type)\s+(\w+)/i,
          userId: /(?:user|for)\s+(\S+)/i,
        }
      },
      system_operations: {
        keywords: ['status', 'health', 'check', 'restart', 'reboot', 'system'],
        functions: ['check_status', 'restart_service'],
        extractors: {}
      },
      complex_operations: {
        keywords: ['complex', 'advanced', 'multi', 'orchestrate', 'workflow'],
        functions: ['complex_operation'],
        extractors: {
          operation: /(?:do|perform|execute)\s+(.+)/i,
        }
      }
    }

    // Find matching intent category
    let bestMatch: { category: string; score: number; function: string } | null = null
    let highestScore = 0

    for (const [category, config] of Object.entries(intentPatterns)) {
      const keywordScore = config.keywords.filter(keyword => lowerText.includes(keyword)).length
      if (keywordScore > highestScore) {
        highestScore = keywordScore
        bestMatch = {
          category,
          score: keywordScore,
          function: config.functions[0] // Default to first function
        }
      }
    }

    if (bestMatch && bestMatch.score >= 2) {
      // Extract parameters using regex patterns
      const extractedParams: Record<string, unknown> = {}
      const patterns = intentPatterns[bestMatch.category as keyof typeof intentPatterns].extractors
      
      for (const [param, pattern] of Object.entries(patterns)) {
        const match = userText.match(pattern)
        if (match) {
          extractedParams[param] = match[1]
        }
      }

      return {
        intent: `User wants to ${bestMatch.category.replace('_', ' ')}`,
        confidence: Math.min(0.7, bestMatch.score * 0.15),
        extractedParameters: extractedParams,
        suggestedFunction: bestMatch.function,
        requiresClarification: Object.keys(extractedParams).length < 2,
        clarificationQuestions: this.generateClarificationQuestions(bestMatch.category, extractedParams),
      }
    }

    return {
      intent: 'Could not determine intent from user request',
      confidence: 0.1,
      extractedParameters: {},
      requiresClarification: true,
      clarificationQuestions: [
        'What would you like me to help you with?',
        'You can ask me to manage nodes, users, configurations, or check system status.',
      ],
    }
  }

  /**
   * Generate clarification questions based on missing parameters
   */
  private generateClarificationQuestions(category: string, extractedParams: Record<string, unknown>): string[] {
    const requiredParams: Record<string, string> = {
      node_management: 'Which region should I deploy the node to?',
      user_management: 'What should be the user\'s display name and quota?',
      config_management: 'Which user do you want to generate config for?',
      system_operations: '',
      complex_operations: 'Can you describe the complex operation you need?',
    }

    const questions: string[] = []
    if (requiredParams[category as keyof typeof requiredParams]) {
      questions.push(requiredParams[category as keyof typeof requiredParams])
    }

    return questions
  }

  /**
   * Clear conversation history (for new sessions)
   */
  clearHistory(): void {
    this.conversationHistory = []
  }

  /**
   * Get conversation history
   */
  getHistory(): Array<{ role: ChatRole; content: string }> {
    return [...this.conversationHistory]
  }

  /**
   * Suggest proactive actions based on current state
   */
  suggestProactiveActions(): string[] {
    const suggestions: string[] = []

    // Analyze system state for suggestions
    if (typeof this.systemState.currentStepOrder === 'number' && this.systemState.currentStepOrder > 5) {
      suggestions.push('This workflow has many steps. Would you like me to create a summary?')
    }

    if (this.conversationHistory.length > 10) {
      suggestions.push('Our conversation is getting long. Would you like me to summarize what we\'ve accomplished?')
    }

    // Time-based suggestions
    const hour = new Date().getHours()
    if (hour >= 9 && hour <= 17) {
      suggestions.push('Good time for system maintenance. Would you like me to check system health?')
    }

    return suggestions
  }
}