/**
 * Base Agent Class
 * All specialized agents extend this base class
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, AgentState, AgentStatus, AgentMessage, AgentCapability, SharedReasoningTrace, CollaborativeReasoningSession } from '../types';
import { MessageBus } from '../communication/message-bus';
import { MessageBuilder, MessageFactory } from '../communication/message-builder';
import logger from '../../logger';
import { cotEngine, type CoTResult } from '../../ai/reasoning/chain-of-thought';
import { metaCognitionEngine } from '../../ai/reasoning/meta-cognition';
import { reasoningTraceSystem } from '../../ai/reasoning/reasoning-trace';

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected state: AgentState;
  protected messageBus: MessageBus;
  protected isRunning: boolean;
  protected messageHandlers: Map<string, (message: AgentMessage) => Promise<void>>;
  protected taskQueue: Map<string, any>;
  
  // Advanced reasoning integration
  protected enableChainOfThought: boolean = true;
  protected enableMetaCognition: boolean = true;
  protected enableReasoningTraces: boolean = true;
  protected enableCollaborativeReasoning: boolean = false;
  protected enableReasoningSharing: boolean = false;
  protected currentReasoningSessionId: string | null = null;
  
  // Collaborative reasoning
  protected collaborativeSessions: Map<string, CollaborativeReasoningSession>;
  protected sharedReasoningTraces: Map<string, SharedReasoningTrace>;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super();
    this.config = config;
    this.state = {
      config,
      status: 'initializing',
      currentTasks: [],
      completedTasks: 0,
      failedTasks: 0,
      averageResponseTime: 0,
      lastHeartbeat: new Date(),
      uptime: 0,
      reputation: 1.0,
      load: 0,
    };
    this.messageBus = messageBus;
    this.isRunning = false;
    this.messageHandlers = new Map();
    this.taskQueue = new Map();
    this.collaborativeSessions = new Map();
    this.sharedReasoningTraces = new Map();
    
    // Apply reasoning configuration if provided
    if (config.reasoningConfig) {
      this.enableChainOfThought = config.reasoningConfig.enableChainOfThought;
      this.enableMetaCognition = config.reasoningConfig.enableMetaCognition;
      this.enableReasoningTraces = config.reasoningConfig.enableReasoningTraces;
      this.enableCollaborativeReasoning = config.reasoningConfig.enableCollaborativeReasoning;
      this.enableReasoningSharing = config.reasoningConfig.enableReasoningSharing;
    }
  }

  /** Tool descriptors passed to chain-of-thought (override in subclasses). */
  protected getAgentTools(): any[] {
    return []
  }

  /** Whether chain-of-thought is warranted for this task */
  protected isComplexTask(task: {
    type?: string
    description?: string
    priority?: number
  }): boolean {
    const desc = `${task.type ?? ''} ${task.description ?? ''}`.toLowerCase()
    if ((task.priority ?? 0) >= 8) return true
    if (
      desc.includes('multi') ||
      desc.includes('orchestrat') ||
      desc.includes('deploy') ||
      desc.includes('exfil')
    ) {
      return true
    }
    return desc.length > 120
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    // Register message handlers
    this.registerMessageHandlers();

    // Register with message bus
    this.messageBus.registerHandler(this.config.id, this.handleMessage.bind(this));

    // Update status
    this.state.status = 'idle';
    
    logger.info(`Agent ${this.config.id} (${this.config.name}) initialized`);
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.state.status = 'idle';

    // Start heartbeat interval
    this.startHeartbeat();

    // Agent-specific startup
    await this.onStartup();

    logger.info(`Agent ${this.config.id} started`);
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.state.status = 'offline';

    // Stop heartbeat
    this.stopHeartbeat();

    // Agent-specific shutdown
    await this.onShutdown();

    // Unregister from message bus
    this.messageBus.unregisterHandler(this.config.id);

    logger.info(`Agent ${this.config.id} stopped`);
  }

  /**
   * Register message handlers
   */
  protected registerMessageHandlers(): void {
    this.messageHandlers.set('task_request', this.handleTaskRequest.bind(this));
    this.messageHandlers.set('status_request', this.handleStatusRequest.bind(this));
    this.messageHandlers.set('capability_request', this.handleCapabilityRequest.bind(this));
    this.messageHandlers.set('heartbeat', this.handleHeartbeat.bind(this));
    this.messageHandlers.set('negotiation', this.handleNegotiation.bind(this));
    this.messageHandlers.set('reasoning_share', this.handleReasoningShare.bind(this));
    this.messageHandlers.set('collaborative_reasoning_invite', this.handleCollaborativeReasoningInvite.bind(this));
    this.messageHandlers.set('collaborative_reasoning_response', this.handleCollaborativeReasoningResponse.bind(this));
  }

  /**
   * Handle incoming message
   */
  protected async handleMessage(message: AgentMessage): Promise<void> {
    try {
      const handler = this.messageHandlers.get(message.payload.type);
      if (handler) {
        await handler(message);
      } else {
        logger.warn(`No handler for message type: ${message.payload.type}`);
      }
    } catch (error) {
      logger.error({ err: error }, `Error handling message from ${message.fromAgent}`);
      await this.sendErrorResponse(message, error as Error);
    }
  }

  /**
   * Handle task request
   */
  protected async handleTaskRequest(message: AgentMessage): Promise<void> {
    if (this.state.status !== 'idle' && this.state.currentTasks.length >= this.config.maxConcurrentTasks) {
      await this.sendBusyResponse(message);
      return;
    }

    const task = message.payload.data;
    const taskId = task.id || uuidv4();

    try {
      // Add to current tasks
      this.state.currentTasks.push(taskId);
      this.state.status = 'busy';
      this.state.load = Math.min(1, this.state.load + 0.2);

      // Start reasoning trace if enabled
      if (this.enableReasoningTraces) {
        this.currentReasoningSessionId = reasoningTraceSystem.startSession(`agent-${this.config.id}-${taskId}`);
        reasoningTraceSystem.logEvent('reasoning_start', {
          agentId: this.config.id,
          taskId,
          taskType: task.type,
          taskDescription: task.description,
        });
      }

      // Assess uncertainty if meta-cognition is enabled
      let uncertaintyAssessment = null;
      if (this.enableMetaCognition) {
        uncertaintyAssessment = await metaCognitionEngine.assessUncertainty(
          JSON.stringify(task),
          { agentId: this.config.id, taskId }
        );
        
        if (this.enableReasoningTraces) {
          reasoningTraceSystem.addUncertaintyAssessment(uncertaintyAssessment);
        }

        // Detect knowledge gaps
        const knowledgeGaps = await metaCognitionEngine.detectKnowledgeGaps(
          JSON.stringify(task),
          { agentId: this.config.id, taskId }
        );
        
        for (const gap of knowledgeGaps) {
          if (this.enableReasoningTraces) {
            reasoningTraceSystem.addKnowledgeGap(gap);
          }
        }
      }

      // Execute task with or without chain-of-thought
      const startTime = Date.now();
      let result: any;
      
      if (this.enableChainOfThought && this.isComplexTask(task)) {
        // Use chain-of-thought for complex tasks
        if (this.enableReasoningTraces) {
          reasoningTraceSystem.logEvent('decision_made', {
            decision: 'use_chain_of_thought',
            taskId,
          });
        }

        const cotResult = await cotEngine.reason(
          JSON.stringify(task),
          { agentId: this.config.id, taskId, agentType: this.config.type },
          this.getAgentTools()
        );

        if (this.enableReasoningTraces) {
          for (const step of cotResult.reasoningSteps) {
            reasoningTraceSystem.addReasoningStep(step);
          }
        }

        // Execute task based on CoT reasoning
        result = await this.executeTaskWithReasoning(task, cotResult);
      } else {
        // Standard task execution
        result = await this.executeTask(task);
      }

      const duration = Date.now() - startTime;

      // Calibrate confidence based on actual success
      if (this.enableMetaCognition && uncertaintyAssessment) {
        metaCognitionEngine.recordOutcome(uncertaintyAssessment.confidence, 1.0);
      }

      // End reasoning trace
      if (this.enableReasoningTraces && this.currentReasoningSessionId) {
        reasoningTraceSystem.endSession({
          action: `execute_task_${task.type}`,
          confidence: uncertaintyAssessment?.confidence || 0.8,
          reasoning: `Agent ${this.config.id} executed task ${taskId}`,
        });
        this.currentReasoningSessionId = null;
      }

      // Share reasoning trace if enabled and task was successful
      if (this.enableReasoningSharing && this.enableChainOfThought && this.isComplexTask(task)) {
        // Determine target agents (could be agents with similar capabilities)
        const targetAgents = await this.findSimilarAgents();
        if (targetAgents.length > 0) {
          await this.shareReasoningTrace(
            task.operationId || 'unknown',
            taskId,
            'combined',
            { 
              task: task.type,
              reasoning: result,
              uncertainty: uncertaintyAssessment,
            },
            uncertaintyAssessment?.confidence || 0.8,
            'success',
            targetAgents
          );
        }
      }

      // Update state
      this.state.currentTasks = this.state.currentTasks.filter(t => t !== taskId);
      this.state.completedTasks++;
      this.state.load = Math.max(0, this.state.load - 0.2);
      this.state.averageResponseTime = 
        (this.state.averageResponseTime * (this.state.completedTasks - 1) + duration) / this.state.completedTasks;
      
      if (this.state.currentTasks.length === 0) {
        this.state.status = 'idle';
      }

      // Send success response
      await this.sendSuccessResponse(message, result, duration);

      logger.info(`Agent ${this.config.id} completed task ${taskId}`);
    } catch (error) {
      // Log error to reasoning trace
      if (this.enableReasoningTraces && this.currentReasoningSessionId) {
        reasoningTraceSystem.addError(error as Error, { taskId, agentId: this.config.id });
        
        reasoningTraceSystem.endSession({
          action: `execute_task_${task.type}`,
          confidence: 0.1,
          reasoning: `Agent ${this.config.id} failed task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        });
        this.currentReasoningSessionId = null;
      }

      // Record failure for calibration
      if (this.enableMetaCognition) {
        metaCognitionEngine.recordOutcome(0.8, 0.0);
      }

      // Update state on failure
      this.state.currentTasks = this.state.currentTasks.filter(t => t !== taskId);
      this.state.failedTasks++;
      this.state.load = Math.max(0, this.state.load - 0.2);
      this.state.reputation = Math.max(0.5, this.state.reputation - 0.05);
      if (this.state.currentTasks.length === 0) {
        this.state.status = 'idle';
      }

      // Send error response
      await this.sendErrorResponse(message, error as Error);

      logger.error({ err: error }, `Agent ${this.config.id} failed task ${taskId}`);
    }
  }

  /**
   * Handle status request
   */
  protected async handleStatusRequest(message: AgentMessage): Promise<void> {
    const response = MessageFactory.response(
      this.config.id,
      message.fromAgent,
      'status_response',
      {
        status: this.state.status,
        load: this.state.load,
        currentTasks: this.state.currentTasks.length,
        completedTasks: this.state.completedTasks,
        failedTasks: this.state.failedTasks,
        reputation: this.state.reputation,
      }
    );

    await this.messageBus.sendMessage(response);
  }

  /**
   * Handle capability request
   */
  protected async handleCapabilityRequest(message: AgentMessage): Promise<void> {
    const response = MessageFactory.response(
      this.config.id,
      message.fromAgent,
      'capability_response',
      this.config.capabilities
    );

    await this.messageBus.sendMessage(response);
  }

  /**
   * Handle heartbeat
   */
  protected async handleHeartbeat(message: AgentMessage): Promise<void> {
    this.state.lastHeartbeat = new Date();
    // No response needed for heartbeat
  }

  /**
   * Handle negotiation
   */
  protected async handleNegotiation(message: AgentMessage): Promise<void> {
    const negotiation = message.payload.data;
    const response = await this.evaluateNegotiation(negotiation);

    const responseMessage = MessageFactory.response(
      this.config.id,
      message.fromAgent,
      'negotiation_response',
      response,
      message.id
    );

    await this.messageBus.sendMessage(responseMessage);
  }

  /**
   * Handle reasoning share
   */
  protected async handleReasoningShare(message: AgentMessage): Promise<void> {
    if (!this.enableReasoningSharing) {
      return;
    }

    const sharedTrace: SharedReasoningTrace = message.payload.data;
    this.sharedReasoningTraces.set(sharedTrace.id, sharedTrace);
    
    logger.info(`Agent ${this.config.id} received shared reasoning trace ${sharedTrace.id} from ${message.fromAgent}`);
    
    // Optionally learn from shared reasoning
    if (this.enableMetaCognition) {
      await this.learnFromSharedReasoning(sharedTrace);
    }
  }

  /**
   * Handle collaborative reasoning invite
   */
  protected async handleCollaborativeReasoningInvite(message: AgentMessage): Promise<void> {
    if (!this.enableCollaborativeReasoning) {
      await this.sendCollaborativeReasoningResponse(message, 'decline', 'Collaborative reasoning not enabled');
      return;
    }

    const session: CollaborativeReasoningSession = message.payload.data;
    this.collaborativeSessions.set(session.id, session);
    
    logger.info(`Agent ${this.config.id} invited to collaborative reasoning session ${session.id}`);
    
    // Evaluate and respond
    const shouldParticipate = await this.evaluateCollaborativeReasoningInvite(session);
    const response = shouldParticipate ? 'accept' : 'decline';
    const reasoning = shouldParticipate ? 'Willing to collaborate on reasoning task' : 'Unable to participate at this time';
    
    await this.sendCollaborativeReasoningResponse(message, response, reasoning);
  }

  /**
   * Handle collaborative reasoning response
   */
  protected async handleCollaborativeReasoningResponse(message: AgentMessage): Promise<void> {
    const response = message.payload.data;
    logger.info(`Agent ${this.config.id} received collaborative reasoning response from ${message.fromAgent}`);
    
    // Update session with response
    const session = this.collaborativeSessions.get(response.sessionId);
    if (session) {
      // Add response to session
      // Implementation depends on session structure
    }
  }

  /**
   * Send success response
   */
  protected async sendSuccessResponse(originalMessage: AgentMessage, result: any, duration: number): Promise<void> {
    const response = MessageFactory.response(
      this.config.id,
      originalMessage.fromAgent,
      'task_result',
      {
        success: true,
        result,
        duration,
        agentId: this.config.id,
      },
      originalMessage.id
    );

    await this.messageBus.sendMessage(response);
  }

  /**
   * Send error response
   */
  protected async sendErrorResponse(originalMessage: AgentMessage, error: Error): Promise<void> {
    const response = MessageFactory.response(
      this.config.id,
      originalMessage.fromAgent,
      'task_error',
      {
        success: false,
        error: error.message,
        stack: error.stack,
        agentId: this.config.id,
      },
      originalMessage.id
    );

    await this.messageBus.sendMessage(response);
  }

  /**
   * Send busy response
   */
  protected async sendBusyResponse(originalMessage: AgentMessage): Promise<void> {
    const response = MessageFactory.response(
      this.config.id,
      originalMessage.fromAgent,
      'task_busy',
      {
        success: false,
        reason: 'Agent at capacity',
        currentLoad: this.state.load,
        currentTasks: this.state.currentTasks.length,
        agentId: this.config.id,
      },
      originalMessage.id
    );

    await this.messageBus.sendMessage(response);
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    setInterval(async () => {
      if (this.isRunning) {
        await this.sendHeartbeat();
      }
    }, 10000); // 10 second heartbeat
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    // Heartbeat is managed by the interval, will stop when isRunning is false
  }

  /**
   * Send heartbeat to registry
   */
  private async sendHeartbeat(): Promise<void> {
    const heartbeat = MessageFactory.heartbeat(
      this.config.id,
      'registry',
      {
        load: this.state.load,
        status: this.state.status,
      }
    );

    await this.messageBus.sendMessage(heartbeat);
  }

  /**
   * Send message to another agent
   */
  protected async sendMessage(toAgent: string | string[], messageType: string, data: any): Promise<void> {
    const message = MessageFactory.request(
      this.config.id,
      toAgent,
      messageType,
      data,
      'normal'
    );

    await this.messageBus.sendMessage(message);
  }

  /**
   * Broadcast message to all agents
   */
  protected async broadcastMessage(messageType: string, data: any): Promise<void> {
    const message = MessageFactory.broadcast(
      this.config.id,
      messageType,
      data,
      'normal'
    );

    await this.messageBus.sendMessage(message);
  }

  /**
   * Share reasoning trace with other agents
   */
  protected async shareReasoningTrace(
    operationId: string,
    taskId: string,
    reasoningType: 'chain_of_thought' | 'meta_cognition' | 'combined',
    content: any,
    confidence: number,
    outcome: 'success' | 'failure' | 'partial',
    targetAgents: string[]
  ): Promise<void> {
    if (!this.enableReasoningSharing) {
      return;
    }

    const sharedTrace: SharedReasoningTrace = {
      id: uuidv4(),
      sourceAgent: this.config.id,
      operationId,
      taskId,
      reasoningType,
      content,
      confidence,
      outcome,
      timestamp: new Date(),
      sharedWith: targetAgents,
      usageCount: 0,
      effectiveness: outcome === 'success' ? 1.0 : outcome === 'partial' ? 0.5 : 0.0,
    };

    this.sharedReasoningTraces.set(sharedTrace.id, sharedTrace);

    // Share with target agents
    for (const agentId of targetAgents) {
      const message = MessageFactory.request(
        this.config.id,
        agentId,
        'reasoning_share',
        sharedTrace,
        'normal'
      );
      await this.messageBus.sendMessage(message);
    }

    logger.info(`Agent ${this.config.id} shared reasoning trace ${sharedTrace.id} with ${targetAgents.length} agents`);
  }

  /**
   * Initiate collaborative reasoning session
   */
  protected async initiateCollaborativeReasoning(
    operationId: string,
    objective: string,
    targetAgents: string[]
  ): Promise<string> {
    if (!this.enableCollaborativeReasoning) {
      throw new Error('Collaborative reasoning not enabled');
    }

    const sessionId = uuidv4();
    const session: CollaborativeReasoningSession = {
      id: sessionId,
      operationId,
      initiatingAgent: this.config.id,
      participatingAgents: [this.config.id, ...targetAgents],
      objective,
      status: 'active',
      reasoningSteps: [],
      consensus: null,
      timestamp: new Date(),
    };

    this.collaborativeSessions.set(sessionId, session);

    // Invite other agents
    for (const agentId of targetAgents) {
      const message = MessageFactory.request(
        this.config.id,
        agentId,
        'collaborative_reasoning_invite',
        session,
        'high'
      );
      await this.messageBus.sendMessage(message);
    }

    logger.info(`Agent ${this.config.id} initiated collaborative reasoning session ${sessionId}`);
    return sessionId;
  }

  /**
   * Send collaborative reasoning response
   */
  private async sendCollaborativeReasoningResponse(
    originalMessage: AgentMessage,
    response: 'accept' | 'decline',
    reasoning: string
  ): Promise<void> {
    const responseMessage = MessageFactory.response(
      this.config.id,
      originalMessage.fromAgent,
      'collaborative_reasoning_response',
      {
        sessionId: originalMessage.payload.data.id,
        response,
        reasoning,
        agentId: this.config.id,
      },
      originalMessage.id
    );

    await this.messageBus.sendMessage(responseMessage);
  }

  /**
   * Learn from shared reasoning trace
   */
  private async learnFromSharedReasoning(sharedTrace: SharedReasoningTrace): Promise<void> {
    // Update meta-cognition with shared knowledge
    if (sharedTrace.outcome === 'success' && sharedTrace.effectiveness > 0.7) {
      // Could add to knowledge base or update reasoning patterns
      logger.info(`Agent ${this.config.id} learned from successful shared reasoning trace ${sharedTrace.id}`);
    }
  }

  /**
   * Evaluate collaborative reasoning invite
   */
  private async evaluateCollaborativeReasoningInvite(session: CollaborativeReasoningSession): Promise<boolean> {
    // Simple heuristic: accept if agent has capacity and objective is relevant
    if (this.state.load > 0.8) {
      return false;
    }

    // Check if objective is relevant to agent's capabilities
    const isRelevant = this.isObjectiveRelevant(session.objective);
    return isRelevant;
  }

  /**
   * Check if objective is relevant to agent
   */
  private isObjectiveRelevant(objective: string): boolean {
    // Simple implementation - could be enhanced with semantic matching
    const keywords = this.config.capabilities.map(cap => cap.name.toLowerCase());
    const objectiveLower = objective.toLowerCase();
    return keywords.some(keyword => objectiveLower.includes(keyword));
  }

  /**
   * Find similar agents based on capabilities
   */
  private async findSimilarAgents(): Promise<string[]> {
    // This would typically query the agent registry
    // For now, return empty array - to be implemented with registry integration
    return [];
  }

  /**
   * Abstract method: Execute task (to be implemented by subclasses)
   */
  /** Override to incorporate CoT output; default runs the normal task path. */
  protected async executeTaskWithReasoning(task: any, _cotResult: CoTResult): Promise<any> {
    return this.executeTask(task)
  }

  protected abstract executeTask(task: any): Promise<any>;

  /**
   * Abstract method: Evaluate negotiation (to be implemented by subclasses)
   */
  protected abstract evaluateNegotiation(negotiation: any): Promise<any>;

  /**
   * Abstract method: On startup (to be implemented by subclasses)
   */
  protected abstract onStartup(): Promise<void>;

  /**
   * Abstract method: On shutdown (to be implemented by subclasses)
   */
  protected abstract onShutdown(): Promise<void>;

  /**
   * Get agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapability[] {
    return this.config.capabilities;
  }
}