import type { IntentAnalysis } from './types'
import type { ChatRole, ChatMessage } from '../agents/llm'

export class IntentAnalyzer {
  private conversationHistory: Array<{ role: ChatRole; content: string }> = []
  private systemState: Record<string, unknown> = {}
  private workflowContext: {
    currentStep?: string
    completedSteps: string[]
    pendingSteps: string[]
    workflowGoal?: string
  } = {
    completedSteps: [],
    pendingSteps: [],
  }

  /**
   * Analyze user intent from natural language input with enhanced context and multi-step reasoning
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

    // Create enhanced system prompt with context awareness and multi-step reasoning
    const systemPrompt = this.createMultiStepSystemPrompt(availableFunctions)

    // Create user prompt with rich context
    const userPrompt = this.createEnhancedUserPrompt(userText, context)

    try {
      // Call LLM to analyze intent with conversation history and multi-step reasoning
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory.slice(-15) as ChatMessage[], // Keep last 15 messages for better context
        { role: 'user', content: userPrompt },
      ]

      const response = await chatComplete({
        messages,
        temperature: 0.2, // Lower temperature for more focused reasoning
      })

      // Parse the LLM response with multi-step support
      const analysis = this.parseEnhancedLlmResponse(response.content || '')

      // Update workflow context if multi-step detected
      if (analysis.suggestedChaining && analysis.suggestedChaining.length > 0) {
        this.workflowContext.pendingSteps = analysis.suggestedChaining.slice(1)
        this.workflowContext.currentStep = analysis.suggestedChaining[0]
        this.workflowContext.workflowGoal = analysis.intent
      }

      // Add AI response to conversation history
      this.conversationHistory.push({ 
        role: 'assistant' as ChatRole,
        content: `I understand you want to: ${analysis.intent}. ${analysis.suggestedFunction ? `I'll use the ${analysis.suggestedFunction} function.` : 'I need more information.'} ${analysis.suggestedChaining && analysis.suggestedChaining.length > 1 ? `This will be followed by ${analysis.suggestedChaining.slice(1).join(', ')}.` : ''}` 
      })

      return analysis
    } catch (error) {
      console.error('Error analyzing intent:', error)

      // Enhanced fallback with pattern matching and multi-step detection
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
   * Create enhanced system prompt with multi-step reasoning capabilities
   */
  private createMultiStepSystemPrompt(availableFunctions: any[]): string {
    const functionDescriptions = availableFunctions
      .map(fn => `- ${fn.name}: ${fn.description}\n  Parameters: ${JSON.stringify(fn.parameters)}\n  Category: ${fn.category}`)
      .join('\n\n')

    return `You are an advanced AI workflow assistant with multi-step reasoning capabilities that analyzes user intent and orchestrates complex backend operations.

CAPABILITIES:
- Understand complex, multi-step user requests
- Extract structured parameters from natural language
- Map intents to appropriate backend functions
- Recognize when clarification is needed
- Maintain context across conversation turns
- Suggest optimizations and alternatives
- Plan and execute multi-step workflows with function chaining
- Handle dependencies between operations
- Provide progress tracking for long-running workflows

AVAILABLE FUNCTIONS:
${functionDescriptions}

WORKFLOW CONTEXT:
Current Step: ${this.workflowContext.currentStep || 'None'}
Completed Steps: ${this.workflowContext.completedSteps.join(', ') || 'None'}
Pending Steps: ${this.workflowContext.pendingSteps.join(', ') || 'None'}
Workflow Goal: ${this.workflowContext.workflowGoal || 'None'}

SYSTEM STATE:
${JSON.stringify(this.systemState, null, 2)}

MULTI-STEP REASONING GUIDELINES:
1. Parse the user's intent considering conversation history and workflow context
2. Extract all relevant parameters with appropriate types
3. Consider system state and workflow progress when suggesting functions
4. Identify dependencies or prerequisite operations
5. Plan function chaining for complex workflows with logical ordering
6. Set confidence based on clarity and parameter completeness
7. Ask clarifying questions only when essential
8. Suggest alternative approaches if the primary approach has risks
9. Consider error handling and rollback strategies for multi-step operations
10. Validate that suggested functions exist in the available functions list

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
  "suggestedChaining": ["function1", "function2", "function3"] if multi-step workflow,
  "alternativeApproaches": ["alternative1", "alternative2"] if applicable,
  "dependencies": ["dependency1", "dependency2"] if applicable,
  "estimatedSteps": 5 if multi-step workflow,
  "riskLevel": "low|medium|high" based on operation complexity
}

Be precise but flexible. If multiple approaches exist, suggest the most appropriate one. For complex requests, always suggest a logical chain of functions.`
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
   * Parse enhanced LLM response with multi-step support
   */
  private parseEnhancedLlmResponse(response: string): IntentAnalysis {
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
        suggestedChaining: parsed.suggestedChaining || undefined,
        alternativeApproaches: parsed.alternativeApproaches || undefined,
        dependencies: parsed.dependencies || undefined,
        estimatedSteps: parsed.estimatedSteps || undefined,
        riskLevel: parsed.riskLevel || undefined,
      }
    } catch (error) {
      console.error('Error parsing enhanced LLM response:', error)
      throw error
    }
  }

  /**
   * Parse LLM response into IntentAnalysis (legacy method)
   */
  private parseLlmResponse(response: string): IntentAnalysis {
    return this.parseEnhancedLlmResponse(response)
  }

  /**
   * Enhanced fallback with pattern matching and multi-step detection
   */
  private enhancedFallbackAnalysis(userText: string, availableFunctions: any[], context: Record<string, unknown>): IntentAnalysis {
    const lowerText = userText.toLowerCase()

    // Enhanced keyword mappings with patterns and multi-step support
    const intentPatterns = {
      node_management: {
        keywords: ['node', 'server', 'instance', 'host', 'deploy', 'create', 'add', 'new'],
        functions: ['create_node', 'update_node', 'delete_node', 'list_nodes'],
        extractors: {
          region: /(?:in|at|region)\s+(\w+(?:-\w+)*)/i,
          hostname: /(?:host|hostname|server|ip)\s+(\S+)/i,
          name: /(?:name|called|named)\s+(\S+)/i,
        },
        chaining: ['create_node', 'list_nodes']
      },
      user_management: {
        keywords: ['user', 'client', 'account', 'quota', 'create', 'add', 'new'],
        functions: ['create_user', 'delete_user', 'list_users'],
        extractors: {
          quota: /(\d+)\s*(?:gb|mb|tb)/i,
          displayname: /(?:name|called|named)\s+(\S+)/i,
        },
        chaining: ['create_user', 'generate_config']
      },
      config_management: {
        keywords: ['config', 'configuration', 'generate', 'yaml', 'clash'],
        functions: ['generate_config', 'update_server_config'],
        extractors: {
          format: /(?:format|type)\s+(\w+)/i,
          userId: /(?:user|for)\s+(\S+)/i,
        },
        chaining: ['list_users', 'generate_config']
      },
      system_operations: {
        keywords: ['status', 'health', 'check', 'restart', 'reboot', 'system'],
        functions: ['check_status', 'restart_service'],
        extractors: {},
        chaining: ['check_status']
      },
      osint_operations: {
        keywords: ['osint', 'enumerate', 'subdomain', 'dns', 'whois', 'domain', 'reconnaissance', 'recon'],
        functions: ['enumerate_domain', 'analyze_domain_threats'],
        extractors: {
          domain: /(?:domain|for|target)\s+(\S+\.\S+)/i,
        },
        chaining: ['enumerate_domain', 'analyze_domain_threats']
      },
      threat_intel: {
        keywords: ['threat', 'intel', 'malware', 'virustotal', 'analyze', 'ioc', 'indicator'],
        functions: ['analyze_ip_threats', 'analyze_domain_threats', 'analyze_url_threats'],
        extractors: {
          target: /(?:analyze|check|scan)\s+(\S+)/i,
        },
        chaining: ['enumerate_domain', 'analyze_domain_threats', 'generate_threat_report']
      },
      complex_operations: {
        keywords: ['complex', 'advanced', 'multi', 'orchestrate', 'workflow', 'then', 'after'],
        functions: ['complex_operation'],
        extractors: {
          operation: /(?:do|perform|execute)\s+(.+)/i,
        },
        chaining: ['check_status', 'complex_operation', 'generate_report']
      }
    }

    // Find matching intent category
    let bestMatch: { category: string; score: number; function: string; chaining?: string[] } | null = null
    let highestScore = 0

    for (const [category, config] of Object.entries(intentPatterns)) {
      const keywordScore = config.keywords.filter(keyword => lowerText.includes(keyword)).length
      if (keywordScore > highestScore) {
        highestScore = keywordScore
        bestMatch = {
          category,
          score: keywordScore,
          function: config.functions[0], // Default to first function
          chaining: config.chaining
        }
      }
    }

    // Detect multi-step intent
    const multiStepKeywords = ['then', 'after', 'followed by', 'next', 'and then', 'finally']
    const isMultiStep = multiStepKeywords.some(keyword => lowerText.includes(keyword))

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
        suggestedChaining: isMultiStep ? bestMatch.chaining : undefined,
        estimatedSteps: isMultiStep && bestMatch.chaining ? bestMatch.chaining.length : undefined,
        riskLevel: bestMatch.category === 'threat_intel' || bestMatch.category === 'complex_operations' ? 'medium' : 'low',
      }
    }

    return {
      intent: 'Could not determine intent from user request',
      confidence: 0.1,
      extractedParameters: {},
      requiresClarification: true,
      clarificationQuestions: [
        'What would you like me to help you with?',
        'You can ask me to manage nodes, users, configurations, perform OSINT, threat intelligence analysis, or check system status.',
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