/**
 * Base Agent Class
 * All specialized agents extend this base class
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, AgentState, AgentStatus, AgentMessage, AgentCapability } from '../types';
import { MessageBus } from '../communication/message-bus';
import { MessageBuilder, MessageFactory } from '../communication/message-builder';
import { logger } from '../../logger';

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected state: AgentState;
  protected messageBus: MessageBus;
  protected isRunning: boolean;
  protected messageHandlers: Map<string, (message: AgentMessage) => Promise<void>>;
  protected taskQueue: Map<string, any>;

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
      logger.error(`Error handling message from ${message.fromAgent}`, error);
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

      // Execute task
      const startTime = Date.now();
      const result = await this.executeTask(task);
      const duration = Date.now() - startTime;

      // Update state
      this.state.currentTasks = this.state.currentTasks.filter(t => t !== taskId);
      this.state.completedTasks++;
      this.state.load = Math.max(0, this.state.load - 0.2);
      if (this.state.currentTasks.length === 0) {
        this.state.status = 'idle';
      }

      // Send success response
      await this.sendSuccessResponse(message, result, duration);

      logger.info(`Agent ${this.config.id} completed task ${taskId}`);
    } catch (error) {
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

      logger.error(`Agent ${this.config.id} failed task ${taskId}`, error);
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
   * Abstract method: Execute task (to be implemented by subclasses)
   */
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