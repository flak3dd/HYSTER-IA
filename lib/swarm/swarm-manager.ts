/**
 * Swarm Manager
 * Main entry point for the Multi-Agent AI Swarm Architecture
 * Orchestrates all swarm components and provides high-level API
 */

import { v4 as uuidv4 } from 'uuid';
import { SwarmConfig } from './types';
import { MessageBus } from './communication/message-bus';
import { AgentRegistry } from './agent-registry';
import { SwarmCoordinator } from './orchestration/swarm-coordinator';
import { NegotiationEngine } from './orchestration/negotiation-engine';
import { SwarmIntelligence } from './intelligence/swarm-intelligence';
import { ReconAgent } from './agents/recon-agent';
import { EvasionAgent } from './agents/evasion-agent';
import { ExfiltrationAgent } from './agents/exfiltration-agent';
import { PersistenceAgent } from './agents/persistence-agent';
import { AgentConfig, AgentType } from './types';
import logger from '../logger';

export class SwarmManager {
  private config: SwarmConfig;
  /** Set in {@link SwarmManager.initialize} */
  private messageBus!: MessageBus;
  private registry!: AgentRegistry;
  private coordinator!: SwarmCoordinator;
  private negotiationEngine!: NegotiationEngine;
  private intelligence!: SwarmIntelligence;
  private agents: Map<string, any>; // Agent instances
  private isInitialized: boolean;

  constructor(config: SwarmConfig) {
    this.config = config;
    this.agents = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the swarm
   */
  async initialize(): Promise<void> {
    logger.info('Initializing swarm...');

    // Initialize message bus
    this.messageBus = new MessageBus(this.config.communication);
    await this.messageBus.initialize();

    // Initialize agent registry
    this.registry = new AgentRegistry();
    await this.registry.initialize();

    // Initialize swarm intelligence
    this.intelligence = new SwarmIntelligence(this.config.intelligence);
    await this.intelligence.initialize();

    // Initialize negotiation engine
    this.negotiationEngine = new NegotiationEngine(
      this.registry,
      this.messageBus
    );
    await this.negotiationEngine.initialize();

    // Initialize swarm coordinator
    this.coordinator = new SwarmCoordinator(this.registry, this.messageBus);
    await this.coordinator.initialize();

    // Create and register default agents
    await this.createDefaultAgents();

    this.isInitialized = true;
    logger.info('Swarm initialized successfully');
  }

  /**
   * Create default agents
   */
  private async createDefaultAgents(): Promise<void> {
    const agentConfigs: AgentConfig[] = [
      {
        id: 'recon-agent-1',
        name: 'Reconnaissance Agent Alpha',
        type: 'recon',
        version: '1.0.0',
        llmModel: 'anthropic/claude-3.5-sonnet',
        capabilities: [
          {
            name: 'osint_gathering',
            description: 'Open Source Intelligence gathering',
            category: 'reconnaissance',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.9,
            avgExecutionTime: 30000,
          },
          {
            name: 'network_scanning',
            description: 'Network port and service scanning',
            category: 'reconnaissance',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 50,
            successRate: 0.85,
            avgExecutionTime: 60000,
          },
          {
            name: 'vulnerability_scanning',
            description: 'Vulnerability assessment',
            category: 'reconnaissance',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 60,
            successRate: 0.8,
            avgExecutionTime: 120000,
          },
        ],
        maxConcurrentTasks: 3,
        resourceLimits: {
          maxMemoryMB: 512,
          maxCpuPercent: 50,
          maxNetworkBandwidth: 1000000,
        },
        securityLevel: 'medium',
        priority: 7,
      },
      {
        id: 'evasion-agent-1',
        name: 'Evasion Agent Alpha',
        type: 'evasion',
        version: '1.0.0',
        llmModel: 'anthropic/claude-3.5-sonnet',
        capabilities: [
          {
            name: 'technique_selection',
            description: 'Select optimal evasion techniques',
            category: 'evasion',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 20,
            successRate: 0.85,
            avgExecutionTime: 10000,
          },
          {
            name: 'traffic_mimicry',
            description: 'Generate traffic mimicry patterns',
            category: 'evasion',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 25,
            successRate: 0.9,
            avgExecutionTime: 15000,
          },
          {
            name: 'anti_edr',
            description: 'Generate anti-EDR techniques',
            category: 'evasion',
            requiresAuth: false,
            dangerous: true,
            resourceCost: 40,
            successRate: 0.75,
            avgExecutionTime: 30000,
          },
        ],
        maxConcurrentTasks: 2,
        resourceLimits: {
          maxMemoryMB: 384,
          maxCpuPercent: 40,
          maxNetworkBandwidth: 500000,
        },
        securityLevel: 'high',
        priority: 8,
      },
      {
        id: 'exfil-agent-1',
        name: 'Exfiltration Agent Alpha',
        type: 'exfiltration',
        version: '1.0.0',
        llmModel: 'anthropic/claude-3.5-sonnet',
        capabilities: [
          {
            name: 'data_staging',
            description: 'Stage data for exfiltration',
            category: 'exfiltration',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.95,
            avgExecutionTime: 20000,
          },
          {
            name: 'covert_channel',
            description: 'Establish covert channels',
            category: 'exfiltration',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 40,
            successRate: 0.85,
            avgExecutionTime: 25000,
          },
          {
            name: 'data_encryption',
            description: 'Encrypt data for exfiltration',
            category: 'exfiltration',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 35,
            successRate: 0.95,
            avgExecutionTime: 15000,
          },
        ],
        maxConcurrentTasks: 2,
        resourceLimits: {
          maxMemoryMB: 384,
          maxCpuPercent: 40,
          maxNetworkBandwidth: 2000000,
        },
        securityLevel: 'high',
        priority: 8,
      },
      {
        id: 'persistence-agent-1',
        name: 'Persistence Agent Alpha',
        type: 'persistence',
        version: '1.0.0',
        llmModel: 'anthropic/claude-3.5-sonnet',
        capabilities: [
          {
            name: 'mechanism_deployment',
            description: 'Deploy persistence mechanisms',
            category: 'persistence',
            requiresAuth: false,
            dangerous: true,
            resourceCost: 40,
            successRate: 0.85,
            avgExecutionTime: 30000,
          },
          {
            name: 'redundant_channels',
            description: 'Establish redundant C2 channels',
            category: 'persistence',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 35,
            successRate: 0.9,
            avgExecutionTime: 25000,
          },
          {
            name: 'self_healing',
            description: 'Configure self-healing',
            category: 'persistence',
            requiresAuth: false,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.88,
            avgExecutionTime: 20000,
          },
        ],
        maxConcurrentTasks: 2,
        resourceLimits: {
          maxMemoryMB: 384,
          maxCpuPercent: 40,
          maxNetworkBandwidth: 500000,
        },
        securityLevel: 'high',
        priority: 8,
      },
    ];

    // Create agent instances
    for (const config of agentConfigs) {
      await this.createAgent(config);
    }
  }

  /**
   * Create and register an agent
   */
  async createAgent(config: AgentConfig): Promise<void> {
    let agent: any;

    switch (config.type) {
      case 'recon':
        agent = new ReconAgent(config, this.messageBus);
        break;
      case 'evasion':
        agent = new EvasionAgent(config, this.messageBus);
        break;
      case 'exfiltration':
        agent = new ExfiltrationAgent(config, this.messageBus);
        break;
      case 'persistence':
        agent = new PersistenceAgent(config, this.messageBus);
        break;
      default:
        throw new Error(`Unknown agent type: ${config.type}`);
    }

    // Initialize agent
    await agent.initialize();

    // Register with registry
    await this.registry.registerAgent(config);

    // Start agent
    await agent.start();

    // Store agent instance
    this.agents.set(config.id, agent);

    logger.info(`Agent ${config.id} created and started`);
  }

  /**
   * Execute an operation
   */
  async executeOperation(
    name: string,
    description: string,
    objectives: string[],
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
    createdBy: string = 'system',
    constraints?: any
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    // Create operation
    const operation = await this.coordinator.createOperation(
      name,
      description,
      objectives,
      priority,
      createdBy,
      constraints
    );

    // Plan operation
    await this.coordinator.planOperation(operation.id);

    // Execute operation
    await this.coordinator.executeOperation(operation.id);

    return operation.id;
  }

  /**
   * Get swarm health
   */
  getSwarmHealth() {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    return this.coordinator.getSwarmHealth();
  }

  /**
   * Get operation status
   */
  getOperationStatus(operationId: string) {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    return this.coordinator.getOperation(operationId);
  }

  /**
   * Get all operations
  */
  getAllOperations() {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    return this.coordinator.getAllOperations();
  }

  /**
   * Cancel operation
   */
  async cancelOperation(operationId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    await this.coordinator.cancelOperation(operationId);
  }

  /**
   * Query knowledge base
   */
  async queryKnowledge(query: string, type?: string, tags?: string[]) {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    return this.intelligence.queryKnowledge(query, type, tags);
  }

  /**
   * Add knowledge
   */
  async addKnowledge(entry: any): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Swarm not initialized');
    }

    return this.intelligence.addKnowledge(entry);
  }

  /**
   * Shutdown swarm
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down swarm...');

    // Stop all agents
    for (const [agentId, agent] of this.agents.entries()) {
      await agent.stop();
      await this.registry.unregisterAgent(agentId);
    }

    // Shutdown components
    await this.coordinator.shutdown();
    await this.negotiationEngine.shutdown();
    await this.intelligence.shutdown();
    await this.registry.shutdown();
    await this.messageBus.shutdown();

    this.agents.clear();
    this.isInitialized = false;

    logger.info('Swarm shut down successfully');
  }
}