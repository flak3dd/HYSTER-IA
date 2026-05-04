/**
 * Message Builder Utility
 * Provides fluent interface for creating agent messages
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentMessage, MessageType, MessagePriority, EncryptionType } from '../types';

export class MessageBuilder {
  private message: Partial<AgentMessage>;

  constructor() {
    this.message = {
      id: uuidv4(),
      timestamp: new Date(),
      encryption: 'none',
      requiresAck: false,
    };
  }

  /**
   * Set the message sender
   */
  from(agentId: string): MessageBuilder {
    this.message.fromAgent = agentId;
    return this;
  }

  /**
   * Set the message recipient(s)
   */
  to(agentId: string | string[]): MessageBuilder {
    this.message.toAgent = agentId;
    return this;
  }

  /**
   * Set message type
   */
  type(messageType: MessageType): MessageBuilder {
    this.message.messageType = messageType;
    return this;
  }

  /**
   * Set message priority
   */
  priority(priority: MessagePriority): MessageBuilder {
    this.message.priority = priority;
    return this;
  }

  /**
   * Set message payload
   */
  payload(type: string, data: any, metadata?: Record<string, any>): MessageBuilder {
    this.message.payload = {
      type,
      data,
      metadata,
    };
    return this;
  }

  /**
   * Set conversation ID for multi-turn conversations
   */
  conversation(conversationId: string): MessageBuilder {
    this.message.conversationId = conversationId;
    return this;
  }

  /**
   * Set time-to-live
   */
  ttl(milliseconds: number): MessageBuilder {
    this.message.ttl = milliseconds;
    return this;
  }

  /**
   * Enable acknowledgment
   */
  requireAck(enabled: boolean = true): MessageBuilder {
    this.message.requiresAck = enabled;
    return this;
  }

  /**
   * Set encryption
   */
  encryption(encryptionType: EncryptionType): MessageBuilder {
    this.message.encryption = encryptionType;
    return this;
  }

  /**
   * Set message signature
   */
  signature(signature: string): MessageBuilder {
    this.message.signature = signature;
    return this;
  }

  /**
   * Build the final message
   */
  build(): AgentMessage {
    // Validate required fields
    if (!this.message.fromAgent) {
      throw new Error('Message sender (fromAgent) is required');
    }
    if (!this.message.toAgent) {
      throw new Error('Message recipient (toAgent) is required');
    }
    if (!this.message.messageType) {
      throw new Error('Message type is required');
    }
    if (!this.message.priority) {
      this.message.priority = 'normal';
    }
    if (!this.message.payload) {
      throw new Error('Message payload is required');
    }

    return this.message as AgentMessage;
  }
}

/**
 * Convenience functions for common message types
 */
export class MessageFactory {
  /**
   * Create a request message
   */
  static request(
    from: string,
    to: string | string[],
    payloadType: string,
    data: any,
    priority: MessagePriority = 'normal'
  ): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to(to)
      .type('request')
      .priority(priority)
      .payload(payloadType, data)
      .requireAck(true)
      .build();
  }

  /**
   * Create a response message
   */
  static response(
    from: string,
    to: string,
    payloadType: string,
    data: any,
    originalMessageId?: string
  ): AgentMessage {
    const builder = new MessageBuilder()
      .from(from)
      .to(to)
      .type('response')
      .priority('normal')
      .payload(payloadType, data);

    if (originalMessageId) {
      builder.conversation(originalMessageId);
    }

    return builder.build();
  }

  /**
   * Create a notification message
   */
  static notification(
    from: string,
    to: string | string[],
    payloadType: string,
    data: any,
    priority: MessagePriority = 'normal'
  ): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to(to)
      .type('notification')
      .priority(priority)
      .payload(payloadType, data)
      .build();
  }

  /**
   * Create a negotiation message
   */
  static negotiation(
    from: string,
    to: string | string[],
    payloadType: string,
    data: any,
    conversationId: string
  ): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to(to)
      .type('negotiation')
      .priority('high')
      .payload(payloadType, data)
      .conversation(conversationId)
      .requireAck(true)
      .build();
  }

  /**
   * Create a command message
   */
  static command(
    from: string,
    to: string | string[],
    payloadType: string,
    data: any,
    priority: MessagePriority = 'high'
  ): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to(to)
      .type('command')
      .priority(priority)
      .payload(payloadType, data)
      .requireAck(true)
      .build();
  }

  /**
   * Create a heartbeat message
   */
  static heartbeat(from: string, to: string, data: any): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to(to)
      .type('heartbeat')
      .priority('low')
      .payload('heartbeat', data)
      .ttl(5000) // 5 second TTL
      .build();
  }

  /**
   * Create an error message
   */
  static error(
    from: string,
    to: string,
    error: Error,
    context?: any
  ): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to(to)
      .type('error')
      .priority('high')
      .payload('error', {
        message: error.message,
        stack: error.stack,
        context,
      })
      .build();
  }

  /**
   * Create a broadcast message
   */
  static broadcast(
    from: string,
    payloadType: string,
    data: any,
    priority: MessagePriority = 'normal'
  ): AgentMessage {
    return new MessageBuilder()
      .from(from)
      .to('broadcast')
      .type('notification')
      .priority(priority)
      .payload(payloadType, data)
      .build();
  }
}