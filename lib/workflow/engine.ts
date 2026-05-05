import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import type {
  WorkflowSession,
  WorkflowStep,
  WorkflowSessionStatus,
  WorkflowStepType,
  IntentAnalysis,
  WorkflowSessionResponse,
  CreateWorkflowSessionInput,
  WorkflowStepResponse,
} from './types'
import { ResponseGenerator } from './response-generator'
import { getProactiveIntelligence } from './proactive-intelligence'
import { reasoningTraceSystem } from '../ai/reasoning/reasoning-trace'
import { predictiveCaching } from '../ai/predictive-caching'
import { anomalyDetectionEngine } from '../ai/anomaly-detection'
import { intelligentScheduler } from '../ai/intelligent-scheduler'
import { selfOptimizingConfig } from '../ai/self-optimizing-config'
import { threatCorrelationEngine } from '../ai/threat-correlation'

const prisma = new PrismaClient()
const responseGenerator = new ResponseGenerator()
const proactiveIntelligence = getProactiveIntelligence()

export class WorkflowEngine {
  /**
   * Create a new workflow session
   */
  async createSession(input: CreateWorkflowSessionInput): Promise<WorkflowSessionResponse> {
    // Start reasoning trace for this workflow session
    const traceSessionId = reasoningTraceSystem.startSession(randomUUID())
    
    reasoningTraceSystem.logEvent('reasoning_start', {
      workflowType: input.workflowType,
      initialRequest: input.initialRequest,
    })

    // Clear conversation history for new session
    const { IntentAnalyzer } = await import('./intent-analyzer')
    const analyzer = new IntentAnalyzer()
    analyzer.clearHistory()

    const session = await prisma.workflowSession.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        status: 'initialized',
        currentStepOrder: 0,
        workflowType: input.workflowType,
        context: {
          initialRequest: input.initialRequest,
          startTime: new Date().toISOString(),
          traceSessionId, // Store trace session ID in context
        },
      },
      include: {
        steps: true,
      },
    })

    // Create initial step to analyze the user's request
    const initialStep = await this.createStep(session.id, 0, 'ai_question', {
      content: 'Analyzing your request...',
      aiPrompt: input.initialRequest,
    })

    reasoningTraceSystem.logEvent('decision_made', {
      decision: 'create_initial_step',
      stepId: initialStep.id,
    })

    return {
      session: this.mapDbSessionToWorkflowSession(session),
      nextAction: 'processing',
      message: '🚀 Workflow session created. Analyzing your request...',
      currentStep: this.mapDbStepToWorkflowStep(initialStep),
    }
  }

  /**
   * Process a workflow session (analyze intent, determine next steps)
   */
  async processSession(sessionId: string): Promise<WorkflowSessionResponse> {
    const session = await prisma.workflowSession.findUnique({
      where: { id: sessionId },
      include: { steps: true },
    })

    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Resume reasoning trace if session ID exists in context
    const traceSessionId = (session.context as any)?.traceSessionId
    if (traceSessionId) {
      reasoningTraceSystem.logEvent('reasoning_start', {
        sessionId,
        workflowType: session.workflowType,
      })
    }

    // Update session status
    await prisma.workflowSession.update({
      where: { id: sessionId },
      data: { status: 'processing' },
    })

    reasoningTraceSystem.logEvent('decision_made', {
      decision: 'update_status',
      status: 'processing',
    })

    try {
      // Get the current step
      const currentStep = session.steps.find(s => s.order === session.currentStepOrder)
      if (!currentStep) {
        throw new Error('No current step found')
      }

      // Analyze the user's intent based on the initial request or response
      reasoningTraceSystem.logEvent('decision_made', {
        decision: 'analyze_intent',
        stepId: currentStep.id,
      })

      const intentAnalysis = await this.analyzeIntent(session, currentStep)

      // Get proactive suggestions
      const proactiveSuggestions = await proactiveIntelligence.generatePredictiveSuggestions({
        currentWorkflow: intentAnalysis.suggestedChaining,
        systemState: session.context as Record<string, unknown>
      })

      // Generate enhanced response using the response generator with proactive suggestions
      let enhancedMessage = responseGenerator.generateResponse(
        intentAnalysis,
        session.context as Record<string, unknown>
      )

      // Add proactive suggestions to the response
      if (proactiveSuggestions.length > 0) {
        enhancedMessage += '\n\n**💡 Proactive Suggestions:**\n'
        proactiveSuggestions.slice(0, 3).forEach((suggestion, index) => {
          enhancedMessage += `${index + 1}. **${suggestion.title}** (${suggestion.priority}): ${suggestion.description}\n`
        })
      }

      // Optimize workflow if chaining is suggested
      if (intentAnalysis.suggestedChaining && intentAnalysis.suggestedChaining.length > 2) {
        const optimization = proactiveIntelligence.optimizeWorkflow(intentAnalysis.suggestedChaining)
        if (optimization.improvements.length > 0) {
          enhancedMessage += `\n\n**⚡ Workflow Optimization:**\n`
          enhancedMessage += `Found ${optimization.improvements.length} optimization(s):\n`
          optimization.improvements.forEach(improvement => {
            enhancedMessage += `- ${improvement}\n`
          })
          enhancedMessage += `Estimated time saved: ${optimization.timeSaved}s\n`
        }
      }

      // Determine the next action based on intent analysis
      if (intentAnalysis.requiresClarification) {
        // Ask clarifying questions
        reasoningTraceSystem.logEvent('decision_made', {
          decision: 'request_clarification',
          confidence: intentAnalysis.confidence,
        })

        await this.createStep(sessionId, session.currentStepOrder + 1, 'ai_question', {
          content: enhancedMessage + '\n\n' + intentAnalysis.clarificationQuestions.join('\n'),
          aiPrompt: 'Please provide more details to help me assist you better.',
        })

        await prisma.workflowSession.update({
          where: { id: sessionId },
          data: { 
            status: 'awaiting_input',
            currentStepOrder: session.currentStepOrder + 1,
            context: JSON.parse(JSON.stringify({
              ...(typeof session.context === 'object' ? session.context : {}),
              intentAnalysis,
              proactiveSuggestions,
            })),
          },
        })

        const updatedSession = await prisma.workflowSession.findUnique({
          where: { id: sessionId },
          include: { steps: true },
        })

        return {
          session: this.mapDbSessionToWorkflowSession(updatedSession!),
          nextAction: 'await_input',
          message: enhancedMessage,
          currentStep: this.mapDbStepToWorkflowStep(
            updatedSession!.steps.find(s => s.order === session.currentStepOrder + 1)!
          ),
        }
      } else if (intentAnalysis.suggestedFunction) {
        // Execute the suggested backend function
        reasoningTraceSystem.logEvent('decision_made', {
          decision: 'execute_function',
          function: intentAnalysis.suggestedFunction,
          confidence: intentAnalysis.confidence,
        })

        await this.createStep(sessionId, session.currentStepOrder + 1, 'backend_execution', {
          content: enhancedMessage + `\n\n**Executing:** \`${intentAnalysis.suggestedFunction}\``,
          functionToExecute: intentAnalysis.suggestedFunction,
          functionParameters: intentAnalysis.extractedParameters,
        })

        await prisma.workflowSession.update({
          where: { id: sessionId },
          data: { 
            status: 'executing',
            currentStepOrder: session.currentStepOrder + 1,
            context: JSON.parse(JSON.stringify({
              ...(typeof session.context === 'object' ? session.context : {}),
              intentAnalysis,
              proactiveSuggestions,
            })),
          },
        })

        const updatedSession = await prisma.workflowSession.findUnique({
          where: { id: sessionId },
          include: { steps: true },
        })

        return {
          session: this.mapDbSessionToWorkflowSession(updatedSession!),
          nextAction: 'processing',
          message: enhancedMessage,
          currentStep: this.mapDbStepToWorkflowStep(
            updatedSession!.steps.find(s => s.order === session.currentStepOrder + 1)!
          ),
        }
      } else {
        // No clear intent, ask for clarification
        reasoningTraceSystem.logEvent('decision_made', {
          decision: 'request_clarification_no_intent',
          confidence: intentAnalysis.confidence,
        })

        await this.createStep(sessionId, session.currentStepOrder + 1, 'ai_question', {
          content: enhancedMessage + '\n\nI\'m not sure what you\'d like me to do. Could you please describe your goal more specifically?',
          aiPrompt: 'Please provide more details about what you want to accomplish.',
        })

        await prisma.workflowSession.update({
          where: { id: sessionId },
          data: { 
            status: 'awaiting_input',
            currentStepOrder: session.currentStepOrder + 1,
          },
        })

        const updatedSession = await prisma.workflowSession.findUnique({
          where: { id: sessionId },
          include: { steps: true },
        })

        return {
          session: this.mapDbSessionToWorkflowSession(updatedSession!),
          nextAction: 'await_input',
          message: enhancedMessage,
          currentStep: this.mapDbStepToWorkflowStep(
            updatedSession!.steps.find(s => s.order === session.currentStepOrder + 1)!
          ),
        }
      }
    } catch (error) {
      // Enhanced error handling with recovery suggestions and proactive analysis
      reasoningTraceSystem.addError(error as Error, { sessionId })

      const errorMessage = responseGenerator.generateErrorRecovery(
        error instanceof Error ? error : new Error(String(error)),
        session.context as Record<string, unknown>
      )

      // Log error for proactive learning
      await proactiveIntelligence.generatePredictiveSuggestions({
        recentErrors: [error instanceof Error ? error.message : String(error)],
        systemState: session.context as Record<string, unknown>
      })

      // Handle errors
      await prisma.workflowSession.update({
        where: { id: sessionId },
        data: { status: 'failed' },
      })

      throw new Error(errorMessage)
    }
  }

  /**
   * Handle user response to a workflow step
   */
  async handleUserResponse(input: WorkflowStepResponse): Promise<WorkflowSessionResponse> {
    const session = await prisma.workflowSession.findUnique({
      where: { id: input.sessionId },
      include: { steps: true },
    })

    if (!session) {
      throw new Error(`Session ${input.sessionId} not found`)
    }

    // Update the current step with the user's response
    const currentStep = session.steps.find(s => s.id === input.stepId)
    if (!currentStep) {
      throw new Error(`Step ${input.stepId} not found`)
    }

    await prisma.workflowStep.update({
      where: { id: input.stepId },
      data: {
        userResponse: input.response,
        completed: true,
      },
    })

    // Process the session to determine next steps
    return this.processSession(input.sessionId)
  }

  /**
   * Execute a backend function as part of a workflow
   */
  async executeBackendFunction(sessionId: string, stepId: string): Promise<WorkflowSessionResponse> {
    const session = await prisma.workflowSession.findUnique({
      where: { id: sessionId },
      include: { steps: true },
    })

    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const step = session.steps.find(s => s.id === stepId)
    if (!step || step.functionToExecute) {
      throw new Error(`Step ${stepId} not found or not a backend execution step`)
    }

    try {
      // Check cache for existing results
      const cacheKey = `workflow:${step.functionToExecute}:${JSON.stringify(step.functionParameters)}`
      const cachedResult = await predictiveCaching.get(cacheKey)

      if (cachedResult) {
        console.log(`[Workflow] Cache hit for ${step.functionToExecute}`)
        // Update the step with the cached result
        await prisma.workflowStep.update({
          where: { id: stepId },
          data: {
            executionResult: JSON.parse(JSON.stringify(cachedResult)),
            completed: true,
          },
        })

        // Create a result display step with cached result
        await this.createStep(sessionId, session.currentStepOrder + 1, 'result_display', {
          content: responseGenerator.generateResponse(
            {
              intent: `Execute ${step.functionToExecute}`,
              confidence: 1.0,
              extractedParameters: step.functionParameters as Record<string, unknown> || {},
              suggestedFunction: step.functionToExecute || undefined,
              requiresClarification: false,
              clarificationQuestions: [],
            },
            session.context as Record<string, unknown>,
            cachedResult
          ) + '\n\n*(Result served from cache)*',
        })

        // Mark session as completed
        await prisma.workflowSession.update({
          where: { id: sessionId },
          data: {
            status: 'completed',
            currentStepOrder: session.currentStepOrder + 1,
            completedAt: new Date(),
          },
        })

        const updatedSession = await prisma.workflowSession.findUnique({
          where: { id: sessionId },
          include: { steps: true },
        })

        return {
          session: this.mapDbSessionToWorkflowSession(updatedSession!),
          nextAction: 'completed',
          message: '🎉 ' + responseGenerator.generateResponse(
            {
              intent: `Execute ${step.functionToExecute}`,
              confidence: 1.0,
              extractedParameters: step.functionParameters as Record<string, unknown> || {},
              suggestedFunction: step.functionToExecute || undefined,
              requiresClarification: false,
              clarificationQuestions: [],
            },
            session.context as Record<string, unknown>,
            cachedResult
          ).split('\n')[0] + ' (cached)',
          currentStep: this.mapDbStepToWorkflowStep(
            updatedSession!.steps.find(s => s.order === session.currentStepOrder + 1)!
          ),
        }
      }

      // Execute the function (this will be implemented in the function registry)
      const { FunctionRegistry } = await import('./function-registry')
      const registry = new FunctionRegistry()
      const result = await registry.executeFunction(
        step.functionToExecute!,
        step.functionParameters as Record<string, unknown>
      )

      // Cache the result for future use
      await predictiveCaching.set(cacheKey, result, { ttl: 3600000 }) // Cache for 1 hour
      console.log(`[Workflow] Cached result for ${step.functionToExecute}`)

      // Detect anomalies in workflow patterns
      try {
        await anomalyDetectionEngine.analyzeMetric('workflow_execution', {
          function: step.functionToExecute,
          parameters: step.functionParameters,
          timestamp: Date.now(),
          sessionId,
          success: true,
        })
      } catch (error) {
        console.error('[Workflow] Anomaly detection error:', error)
        // Don't fail the workflow if anomaly detection fails
      }

      // Generate enhanced result message
      const enhancedResult = responseGenerator.generateResponse(
        {
          intent: `Execute ${step.functionToExecute}`,
          confidence: 1.0,
          extractedParameters: step.functionParameters as Record<string, unknown> || {},
          suggestedFunction: step.functionToExecute || undefined,
          requiresClarification: false,
          clarificationQuestions: [],
        },
        session.context as Record<string, unknown>,
        result
      )

      // Update the step with the result
      await prisma.workflowStep.update({
        where: { id: stepId },
        data: {
          executionResult: JSON.parse(JSON.stringify(result)),
          completed: true,
        },
      })

      // Create a result display step with enhanced formatting
      await this.createStep(sessionId, session.currentStepOrder + 1, 'result_display', {
        content: enhancedResult,
      })

      // Mark session as completed
      await prisma.workflowSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          currentStepOrder: session.currentStepOrder + 1,
          completedAt: new Date(),
        },
      })

      const updatedSession = await prisma.workflowSession.findUnique({
        where: { id: sessionId },
        include: { steps: true },
      })

      return {
        session: this.mapDbSessionToWorkflowSession(updatedSession!),
        nextAction: 'completed',
        message: '🎉 ' + enhancedResult.split('\n')[0], // First line as summary
        currentStep: this.mapDbStepToWorkflowStep(
          updatedSession!.steps.find(s => s.order === session.currentStepOrder + 1)!
        ),
      }
    } catch (error) {
      // Detect anomalies in workflow errors
      try {
        await anomalyDetectionEngine.analyzeMetric('workflow_execution', {
          function: step.functionToExecute,
          parameters: step.functionParameters,
          timestamp: Date.now(),
          sessionId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      } catch (anomalyError) {
        console.error('[Workflow] Anomaly detection error:', anomalyError)
      }

      // Enhanced error handling
      const errorRecovery = responseGenerator.generateErrorRecovery(
        error instanceof Error ? error : new Error(String(error)),
        session.context as Record<string, unknown>
      )

      // Handle execution errors
      await prisma.workflowStep.update({
        where: { id: stepId },
        data: {
          error: error instanceof Error ? error.message : String(error),
          completed: true,
        },
      })

      await this.createStep(sessionId, session.currentStepOrder + 1, 'error_handling', {
        content: errorRecovery,
        error: error instanceof Error ? error.message : String(error),
      })

      await prisma.workflowSession.update({
        where: { id: sessionId },
        data: {
          status: 'failed',
          currentStepOrder: session.currentStepOrder + 1,
          completedAt: new Date(),
        },
      })

      const updatedSession = await prisma.workflowSession.findUnique({
        where: { id: sessionId },
        include: { steps: true },
      })

      return {
        session: this.mapDbSessionToWorkflowSession(updatedSession!),
        nextAction: 'error',
        message: '⚠️ Workflow encountered an error. ' + errorRecovery.split('\n')[0],
        currentStep: this.mapDbStepToWorkflowStep(
          updatedSession!.steps.find(s => s.order === session.currentStepOrder + 1)!
        ),
      }
    }
  }

  /**
   * Analyze user intent using AI
   */
  private async analyzeIntent(
    session: any,
    currentStep: any
  ): Promise<IntentAnalysis> {
    // Import AI analysis module
    const { IntentAnalyzer } = await import('./intent-analyzer')
    const analyzer = new IntentAnalyzer()

    const userText = currentStep.userResponse || session.context.initialRequest
    return analyzer.analyze(userText, session.context)
  }

  /**
   * Create a new workflow step
   */
  private async createStep(
    sessionId: string,
    order: number,
    type: WorkflowStepType,
    data: Partial<WorkflowStep>
  ) {
    return prisma.workflowStep.create({
      data: {
        id: randomUUID(),
        sessionId,
        type,
        order,
        content: data.content,
        aiPrompt: data.aiPrompt,
        functionToExecute: data.functionToExecute,
        functionParameters: data.functionParameters ? JSON.parse(JSON.stringify(data.functionParameters)) : null,
        error: data.error,
      },
    })
  }

  /**
   * Map database session to workflow session type
   */
  private mapDbSessionToWorkflowSession(dbSession: any): WorkflowSession {
    return {
      id: dbSession.id,
      userId: dbSession.userId,
      status: dbSession.status as WorkflowSessionStatus,
      currentStepOrder: dbSession.currentStepOrder,
      workflowType: dbSession.workflowType,
      context: dbSession.context as Record<string, unknown>,
      steps: dbSession.steps.map((s: any) => this.mapDbStepToWorkflowStep(s)),
      createdAt: dbSession.createdAt.toISOString(),
      updatedAt: dbSession.updatedAt.toISOString(),
      completedAt: dbSession.completedAt?.toISOString(),
    }
  }

  /**
   * Map database step to workflow step type
   */
  private mapDbStepToWorkflowStep(dbStep: any): WorkflowStep {
    return {
      id: dbStep.id,
      sessionId: dbStep.sessionId,
      type: dbStep.type as WorkflowStepType,
      order: dbStep.order,
      content: dbStep.content,
      aiPrompt: dbStep.aiPrompt,
      userResponse: dbStep.userResponse,
      functionToExecute: dbStep.functionToExecute,
      functionParameters: dbStep.functionParameters as Record<string, unknown>,
      executionResult: dbStep.executionResult,
      error: dbStep.error,
      timestamp: dbStep.timestamp.toISOString(),
      completed: dbStep.completed,
    }
  }
}