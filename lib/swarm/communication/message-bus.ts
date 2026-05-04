/**
 * Message Bus for Agent Communication
 * Handles routing, delivery, and acknowledgment of agent messages
 */

import { AgentMessage, MessageAck, MessageType, MessagePriority, CommunicationBusConfig } from '../types';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from '../../logger';

export class MessageBus extends EventEmitter {
  private config: CommunicationBusConfig;
  private redis?: Redis;
  private messageQueue: Map<string, AgentMessage>;
  private pendingAcks: Map<string, NodeJS.Timeout>;
  private messageHandlers: Map<string, (message: AgentMessage) => Promise<void>>;
  private isInitialized: boolean;

  constructor(config: CommunicationBusConfig) {
    super();
    this.config = config;
    this.messageQueue = new Map();
    this.pendingAcks = new Map();
    this.messageHandlers = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the message bus
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (this.config.type === 'redis') {
        await this.initializeRedis();
      } else if (this.config.type === 'rabbitmq') {
        await this.initializeRabbitMQ();
      } else {
        // Memory-based message bus
        logger.info('Using in-memory message bus');
      }

      this.isInitialized = true;
      logger.info('Message bus initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize message bus', error);
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    if (!this.config.redis) {
      throw new Error('Redis configuration required for Redis message bus');
    }

    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', error);
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    // Subscribe to agent channels
    const subscriber = this.redis.duplicate();
    await subscriber.subscribe('swarm:messages');
    
    subscriber.on('message', (channel, message) => {
      if (channel === 'swarm:messages') {
        try {
          const agentMessage: AgentMessage = JSON.parse(message);
          this.handleIncomingMessage(agentMessage);
        } catch (error) {
          logger.error('Failed to parse incoming message', error);
        }
      }
    });

    logger.info('Redis message bus initialized');
  }

  /**
   * Initialize RabbitMQ connection
   */
  private async initializeRabbitMQ(): Promise<void> {
    // RabbitMQ implementation would go here
    // For now, we'll use memory-based fallback
    logger.warn('RabbitMQ not yet implemented, falling back to memory-based message bus');
  }

  /**
   * Send a message to one or more agents
   */
  async sendMessage(message: AgentMessage): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Message bus not initialized');
    }

    try {
      // Validate message
      this.validateMessage(message);

      // Add to message queue for tracking
      this.messageQueue.set(message.id, message);

      // Route message based on type
      if (this.config.type === 'redis') {
        await this.sendViaRedis(message);
      } else {
        await this.sendInMemory(message);
      }

      // Handle acknowledgment if required
      if (message.requiresAck) {
        await this.waitForAck(message);
      }

      this.emit('message_sent', message);
      logger.debug(`Message sent from ${message.fromAgent} to ${Array.isArray(message.toAgent) ? message.toAgent.join(',') : message.toAgent}`);
    } catch (error) {
      logger.error('Failed to send message', error);
      throw error;
    }
  }

  /**
   * Send message via Redis
   */
  private async sendViaRedis(message: AgentMessage): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    const messageJson = JSON.stringify(message);

    if (Array.isArray(message.toAgent)) {
      // Broadcast or multicast
      for (const agentId of message.toAgent) {
        await this.redis.publish(`agent:${agentId}`, messageJson);
      }
    } else if (message.toAgent === 'broadcast') {
      // Broadcast to all agents
      await this.redis.publish('swarm:messages', messageJson);
    } else {
      // Point-to-point
      await this.redis.publish(`agent:${message.toAgent}`, messageJson);
    }
  }

  /**
   * Send message in-memory
   */
  private async sendInMemory(message: AgentMessage): Promise<void> {
    // For in-memory, we directly call the handler
    if (Array.isArray(message.toAgent)) {
      for (const agentId of message.toAgent) {
        const handler = this.messageHandlers.get(agentId);
        if (handler) {
          await handler(message);
        }
      }
    } else if (message.toAgent === 'broadcast') {
      for (const [agentId, handler] of this.messageHandlers) {
        await handler(message);
      }
    } else {
      const handler = this.messageHandlers.get(message.toAgent);
      if (handler) {
        await handler(message);
      }
    }
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(message: AgentMessage): Promise<void> {
    try {
      // Check TTL
      if (message.ttl) {
        const age = Date.now() - message.timestamp.getTime();
        if (age > message.ttl) {
          logger.debug(`Message ${message.id} expired, TTL exceeded`);
          return;
        }
      }

      // Send acknowledgment if required
      if (message.requiresAck) {
        await this.sendAck(message);
      }

      // Route to appropriate handler
      if (Array.isArray(message.toAgent)) {
        for (const agentId of message.toAgent) {
          const handler = this.messageHandlers.get(agentId);
          if (handler) {
            await handler(message);
          }
        }
      } else {
        const handler = this.messageHandlers.get(message.toAgent);
        if (handler) {
          await handler(message);
        }
      }

      this.emit('message_received', message);
    } catch (error) {
      logger.error('Failed to handle incoming message', error);
    }
  }

  /**
   * Register a message handler for an agent
   */
  registerHandler(agentId: string, handler: (message: AgentMessage) => Promise<void>): void {
    this.messageHandlers.set(agentId, handler);
    logger.debug(`Registered message handler for agent ${agentId}`);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(agentId: string): void {
    this.messageHandlers.delete(agentId);
    logger.debug(`Unregistered message handler for agent ${agentId}`);
  }

  /**
   * Send acknowledgment for a message
   */
  private async sendAck(message: AgentMessage): Promise<void> {
    const ack: MessageAck = {
      messageId: message.id,
      fromAgent: message.toAgent as string,
      toAgent: message.fromAgent,
      receivedAt: new Date(),
      status: 'received',
    };

    const ackMessage: AgentMessage = {
      id: `ack-${message.id}`,
      fromAgent: ack.fromAgent,
      toAgent: ack.toAgent,
      messageType: 'response',
      priority: 'normal',
      timestamp: new Date(),
      payload: {
        type: 'ack',
        data: ack,
      },
      encryption: 'none',
      requiresAck: false,
    };

    await this.sendMessage(ackMessage);
  }

  /**
   * Wait for acknowledgment
   */
  private async waitForAck(message: AgentMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(message.id);
        reject(new Error(`Acknowledgment timeout for message ${message.id}`));
      }, this.config.messageRetention);

      this.pendingAcks.set(message.id, timeout);

      // Listen for acknowledgment
      const handler = (ackMessage: AgentMessage) => {
        if (ackMessage.payload.type === 'ack' && 
            ackMessage.payload.data.messageId === message.id) {
          clearTimeout(timeout);
          this.pendingAcks.delete(message.id);
          resolve();
        }
      };

      this.registerHandler(message.fromAgent, handler);
    });
  }

  /**
   * Validate message structure
   */
  private validateMessage(message: AgentMessage): void {
    if (!message.id) {
      throw new Error('Message ID is required');
    }
    if (!message.fromAgent) {
      throw new Error('From agent is required');
    }
    if (!message.toAgent) {
      throw new Error('To agent is required');
    }
    if (!message.messageType) {
      throw new Error('Message type is required');
    }
    if (!message.payload) {
      throw new Error('Message payload is required');
    }
  }

  /**
   * Get message queue status
   */
  getQueueStatus(): {
    queueSize: number;
    pendingAcks: number;
    registeredHandlers: number;
  } {
    return {
      queueSize: this.messageQueue.size,
      pendingAcks: this.pendingAcks.size,
      registeredHandlers: this.messageHandlers.size,
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    // Clear pending acknowledgments
    for (const timeout of this.pendingAcks.values()) {
      clearTimeout(timeout);
    }
    this.pendingAcks.clear();

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    // Clear handlers
    this.messageHandlers.clear();

    this.isInitialized = false;
    logger.info('Message bus shut down successfully');
  }
}