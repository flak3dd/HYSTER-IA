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

const prisma = new PrismaClient()
const responseGenerator = new ResponseGenerator()
const proactiveIntelligence = getProactiveIntelligence()

export class WorkflowEngine {
  /**
   * Create a new workflow session
   */
  async createSession(input: CreateWorkflowSessionInput): Promise<WorkflowSessionResponse> {
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

    // Update session status
    await prisma.workflowSession.update({
      where: { id: sessionId },
      data: { status: 'processing' },
    })

    try {
      // Get the current step
      const currentStep = session.steps.find(s => s.order === session.currentStepOrder)
      if (!currentStep) {
        throw new Error('No current step found')
      }

      // Analyze the user's intent based on the initial request or response
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
      // Execute the function (this will be implemented in the function registry)
      const { FunctionRegistry } = await import('./function-registry')
      const registry = new FunctionRegistry()
      const result = await registry.executeFunction(
        step.functionToExecute!,
        step.functionParameters as Record<string, unknown>
      )

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