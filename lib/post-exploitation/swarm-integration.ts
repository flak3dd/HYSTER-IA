/**
 * Swarm Integration for Post-Exploitation Module
 * Bridges the post-exploitation components with the existing swarm architecture
 * Registers new agents, functions, and integrates with SwarmCoordinator
 */

import { SwarmManager } from '../swarm/swarm-manager';
import { MessageBus } from '../swarm/communication/message-bus';
import { LateralMovementAgent } from './agents/lateral-movement-agent';
import { CredentialHarvesterAgent } from './agents/credential-harvester-agent';
import { lateralMovementEngine } from './engine';
import { credentialVault } from './credential-vault';
import { pathfinder } from './pathfinder';
import logger from '../logger';
import type { AgentConfig } from '../swarm/types';

export class PostExploitationSwarmIntegration {
  private swarmManager: SwarmManager;
  private messageBus: MessageBus;
  private lateralMovementAgent: LateralMovementAgent | null = null;
  private credentialHarvesterAgent: CredentialHarvesterAgent | null = null;
  private registered = false;

  constructor(swarmManager: SwarmManager, messageBus: MessageBus) {
    this.swarmManager = swarmManager;
    this.messageBus = messageBus;
  }

  async register(): Promise<void> {
    if (this.registered) {
      logger.warn('Post-exploitation swarm integration already registered');
      return;
    }

    logger.info('Registering post-exploitation swarm integration');

    try {
      // Register agents
      await this.registerAgents();

      // Register functions
      await this.registerFunctions();

      // Register event handlers
      this.registerEventHandlers();

      this.registered = true;
      logger.info('Post-exploitation swarm integration registered successfully');
    } catch (error) {
      logger.error('Failed to register post-exploitation swarm integration:', error);
      throw error;
    }
  }

  private async registerAgents(): Promise<void> {
    logger.info('Registering post-exploitation agents');

    // Register LateralMovementAgent
    const lmAgentConfig: AgentConfig = {
      id: 'lateral-movement-agent',
      name: 'Lateral Movement Agent',
      type: 'lateral_movement',
      version: '1.0.0',
      llmModel: 'gpt-4',
      capabilities: [
        {
          name: 'discover_attack_paths',
          description: 'Discover attack paths using graph-based analysis',
          category: 'reconnaissance',
          successRate: 0.85
        },
        {
          name: 'execute_lateral_movement',
          description: 'Execute lateral movement using various techniques',
          category: 'execution',
          successRate: 0.75
        },
        {
          name: 'auto_pivot',
          description: 'Automatically pivot through network to reach target privilege',
          category: 'automation',
          successRate: 0.70
        }
      ],
      maxConcurrentTasks: 3,
      resourceLimits: {
        maxMemory: 512,
        maxCpu: 50
      },
      securityLevel: 'high',
      priority: 8,
      reasoningConfig: {
        enableChainOfThought: true,
        enableMetaCognition: true,
        enableReasoningTraces: true
      }
    };

    this.lateralMovementAgent = new LateralMovementAgent(lmAgentConfig, this.messageBus);
    await this.lateralMovementAgent.initialize();
    await this.swarmManager.registerAgent(this.lateralMovementAgent);

    // Register CredentialHarvesterAgent
    const chAgentConfig: AgentConfig = {
      id: 'credential-harvester-agent',
      name: 'Credential Harvester Agent',
      type: 'credential_harvesting',
      version: '1.0.0',
      llmModel: 'gpt-4',
      capabilities: [
        {
          name: 'harvest_credentials',
          description: 'Harvest credentials from compromised hosts',
          category: 'collection',
          successRate: 0.80
        },
        {
          name: 'search_credentials',
          description: 'Search stored credentials by various criteria',
          category: 'analysis',
          successRate: 0.95
        },
        {
          name: 'analyze_credentials',
          description: 'Analyze credentials for patterns and reuse opportunities',
          category: 'analysis',
          successRate: 0.90
        }
      ],
      maxConcurrentTasks: 5,
      resourceLimits: {
        maxMemory: 256,
        maxCpu: 30
      },
      securityLevel: 'high',
      priority: 7,
      reasoningConfig: {
        enableChainOfThought: true,
        enableMetaCognition: false,
        enableReasoningTraces: true
      }
    };

    this.credentialHarvesterAgent = new CredentialHarvesterAgent(chAgentConfig, this.messageBus);
    await this.credentialHarvesterAgent.initialize();
    await this.swarmManager.registerAgent(this.credentialHarvesterAgent);

    logger.info('Post-exploitation agents registered');
  }

  private async registerFunctions(): Promise<void> {
    logger.info('Registering post-exploitation functions');

    // Register lateral_movement function
    await this.swarmManager.registerFunction({
      name: 'lateral_move',
      description: 'Execute lateral movement between compromised hosts',
      category: 'post_exploitation',
      parameters: [
        { name: 'sourceHostId', type: 'string', required: true, description: 'Source host ID' },
        { name: 'targetHostId', type: 'string', required: true, description: 'Target host ID' },
        { name: 'technique', type: 'string', required: true, description: 'Movement technique (smb, winrm, pth)' },
        { name: 'credentialId', type: 'string', required: true, description: 'Credential ID to use' }
      ],
      implementation: 'lateral_movement_execution',
      requiresAuth: true,
      dangerous: false,
      enabled: true
    });

    // Register harvest_credentials function
    await this.swarmManager.registerFunction({
      name: 'harvest_credentials',
      description: 'Harvest credentials from a compromised host',
      category: 'post_exploitation',
      parameters: [
        { name: 'hostId', type: 'string', required: true, description: 'Host ID to harvest from' },
        { name: 'methods', type: 'array', required: true, description: 'Harvest methods (lsass, cached, registry)' }
      ],
      implementation: 'credential_harvest_execution',
      requiresAuth: true,
      dangerous: false,
      enabled: true
    });

    // Register find_attack_path function
    await this.swarmManager.registerFunction({
      name: 'find_attack_path',
      description: 'Find optimal attack paths using graph-based analysis',
      category: 'post_exploitation',
      parameters: [
        { name: 'sourceHostId', type: 'string', required: true, description: 'Source host ID' },
        { name: 'targetPrivilege', type: 'string', required: false, description: 'Target privilege level' }
      ],
      implementation: 'attack_path_discovery',
      requiresAuth: true,
      dangerous: false,
      enabled: true
    });

    // Register auto_pivot function
    await this.swarmManager.registerFunction({
      name: 'auto_pivot',
      description: 'Automatically pivot through network to reach target privilege',
      category: 'post_exploitation',
      parameters: [
        { name: 'sourceHostId', type: 'string', required: true, description: 'Source host ID' },
        { name: 'targetPrivilege', type: 'string', required: false, description: 'Target privilege level' }
      ],
      implementation: 'auto_pivot_execution',
      requiresAuth: true,
      dangerous: true,
      enabled: true
    });

    logger.info('Post-exploitation functions registered');
  }

  private registerEventHandlers(): void {
    // Handle lateral movement events
    lateralMovementEngine.on('movement:executed', (result) => {
      this.messageBus.publish({
        type: 'lateral_movement_completed',
        source: 'post-exploitation',
        data: result,
        timestamp: Date.now()
      });
    });

    lateralMovementEngine.on('movement:approval_required', (request) => {
      this.messageBus.publish({
        type: 'lateral_movement_approval_required',
        source: 'post-exploitation',
        data: request,
        timestamp: Date.now()
      });
    });

    // Handle host compromise events
    lateralMovementEngine.on('host:compromised', (host) => {
      this.messageBus.publish({
        type: 'host_compromised',
        source: 'post-exploitation',
        data: host,
        timestamp: Date.now()
      });
    });

    // Handle session events
    lateralMovementEngine.on('session:started', (session) => {
      this.messageBus.publish({
        type: 'lateral_movement_session_started',
        source: 'post-exploitation',
        data: session,
        timestamp: Date.now()
      });
    });

    lateralMovementEngine.on('session:stopped', (session) => {
      this.messageBus.publish({
        type: 'lateral_movement_session_stopped',
        source: 'post-exploitation',
        data: session,
        timestamp: Date.now()
      });
    });

    logger.info('Post-exploitation event handlers registered');
  }

  async unregister(): Promise<void> {
    if (!this.registered) {
      return;
    }

    logger.info('Unregistering post-exploitation swarm integration');

    try {
      // Unregister agents
      if (this.lateralMovementAgent) {
        await this.swarmManager.unregisterAgent(this.lateralMovementAgent.config.id);
      }
      if (this.credentialHarvesterAgent) {
        await this.swarmManager.unregisterAgent(this.credentialHarvesterAgent.config.id);
      }

      // Remove event listeners
      lateralMovementEngine.removeAllListeners();

      this.registered = false;
      logger.info('Post-exploitation swarm integration unregistered');
    } catch (error) {
      logger.error('Failed to unregister post-exploitation swarm integration:', error);
      throw error;
    }
  }

  getLateralMovementAgent(): LateralMovementAgent | null {
    return this.lateralMovementAgent;
  }

  getCredentialHarvesterAgent(): CredentialHarvesterAgent | null {
    return this.credentialHarvesterAgent;
  }

  isRegistered(): boolean {
    return this.registered;
  }
}

/**
 * Initialize post-exploitation swarm integration
 * Call this during application startup
 */
export async function initializePostExploitationSwarmIntegration(
  swarmManager: SwarmManager,
  messageBus: MessageBus
): Promise<PostExploitationSwarmIntegration> {
  const integration = new PostExploitationSwarmIntegration(swarmManager, messageBus);

  // Initialize engine with agents
  await lateralMovementEngine.initialize({
    lateralMovementAgent: integration.getLateralMovementAgent() || undefined,
    credentialHarvesterAgent: integration.getCredentialHarvesterAgent() || undefined
  });

  // Register integration
  await integration.register();

  return integration;
}