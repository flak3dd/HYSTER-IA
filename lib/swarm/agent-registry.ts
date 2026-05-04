/**
 * Agent Registry and Discovery System
 * Manages agent registration, discovery, health monitoring, and capability matching
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, AgentState, AgentType, AgentStatus, AgentCapability, SwarmHealth } from './types';
import { logger } from '../logger';

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentState>;
  private capabilityIndex: Map<string, Set<string>>; // capability name -> agent IDs
  private typeIndex: Map<AgentType, Set<string>>; // agent type -> agent IDs
  private healthCheckInterval: NodeJS.Timeout | null;
  private heartbeatTimeout: number;

  constructor(heartbeatTimeout: number = 30000) {
    super();
    this.agents = new Map();
    this.capabilityIndex = new Map();
    this.typeIndex = new Map();
    this.healthCheckInterval = null;
    this.heartbeatTimeout = heartbeatTimeout;
  }

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    // Start health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.heartbeatTimeout);

    logger.info('Agent registry initialized');
  }

  /**
   * Register a new agent
   */
  async registerAgent(config: AgentConfig): Promise<string> {
    const agentId = config.id;

    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    // Create initial agent state
    const state: AgentState = {
      config,
      status: 'initializing',
      currentTasks: [],
      completedTasks: 0,
      failedTasks: 0,
      averageResponseTime: 0,
      lastHeartbeat: new Date(),
      uptime: 0,
      reputation: 1.0, // Start with perfect reputation
      load: 0,
    };

    // Register agent
    this.agents.set(agentId, state);

    // Update indexes
    this.updateIndexes(agentId, config);

    // Emit registration event
    this.emit('agent_registered', { agentId, config });
    logger.info(`Agent ${agentId} (${config.name}) registered`);

    return agentId;
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Remove from indexes
    this.removeFromIndexes(agentId, state.config);

    // Remove agent
    this.agents.delete(agentId);

    // Emit unregistration event
    this.emit('agent_unregistered', { agentId });
    logger.info(`Agent ${agentId} unregistered`);
  }

  /**
   * Update agent heartbeat
   */
  async updateHeartbeat(agentId: string, load?: number): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    state.lastHeartbeat = new Date();
    if (load !== undefined) {
      state.load = load;
    }

    // Update status if it was offline
    if (state.status === 'offline') {
      state.status = 'idle';
      this.emit('agent_status_changed', { agentId, status: 'idle' });
    }
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const oldStatus = state.status;
    state.status = status;

    if (oldStatus !== status) {
      this.emit('agent_status_changed', { agentId, status, oldStatus });
      logger.debug(`Agent ${agentId} status changed from ${oldStatus} to ${status}`);
    }
  }

  /**
   * Update agent reputation
   */
  async updateReputation(agentId: string, delta: number): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    state.reputation = Math.max(0, Math.min(1, state.reputation + delta));
    logger.debug(`Agent ${agentId} reputation updated to ${state.reputation}`);
  }

  /**
   * Record task completion
   */
  async recordTaskCompletion(agentId: string, duration: number, success: boolean): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (success) {
      state.completedTasks++;
      // Update average response time using exponential moving average
      state.averageResponseTime = state.averageResponseTime === 0 
        ? duration 
        : 0.7 * state.averageResponseTime + 0.3 * duration;
    } else {
      state.failedTasks++;
      // Decrease reputation on failure
      state.reputation = Math.max(0.5, state.reputation - 0.05);
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentState | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: AgentType): AgentState[] {
    const agentIds = this.typeIndex.get(type);
    if (!agentIds) {
      return [];
    }

    return Array.from(agentIds)
      .map(id => this.agents.get(id))
      .filter((state): state is AgentState => state !== undefined);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capabilityName: string): AgentState[] {
    const agentIds = this.capabilityIndex.get(capabilityName);
    if (!agentIds) {
      return [];
    }

    return Array.from(agentIds)
      .map(id => this.agents.get(id))
      .filter((state): state is AgentState => state !== undefined);
  }

  /**
   * Find best agent for a task based on capabilities and current state
   */
  findBestAgent(requiredCapabilities: string[], excludeAgentIds: string[] = []): AgentState | null {
    const candidates = this.getAgentsByCapability(requiredCapabilities[0]);

    // Filter agents that have all required capabilities
    const qualified = candidates.filter(agent => {
      if (excludeAgentIds.includes(agent.config.id)) {
        return false;
      }

      const agentCapabilities = new Set(agent.config.capabilities.map(c => c.name));
      return requiredCapabilities.every(cap => agentCapabilities.has(cap));
    });

    if (qualified.length === 0) {
      return null;
    }

    // Sort by reputation (higher is better), then load (lower is better)
    qualified.sort((a, b) => {
      if (b.reputation !== a.reputation) {
        return b.reputation - a.reputation;
      }
      return a.load - b.load;
    });

    return qualified[0];
  }

  /**
   * Find multiple agents for parallel execution
   */
  findAgents(requiredCapabilities: string[], count: number, excludeAgentIds: string[] = []): AgentState[] {
    const candidates = this.getAgentsByCapability(requiredCapabilities[0]);

    // Filter agents that have all required capabilities
    const qualified = candidates.filter(agent => {
      if (excludeAgentIds.includes(agent.config.id)) {
        return false;
      }

      const agentCapabilities = new Set(agent.config.capabilities.map(c => c.name));
      return requiredCapabilities.every(cap => agentCapabilities.has(cap));
    });

    // Sort by reputation and load
    qualified.sort((a, b) => {
      if (b.reputation !== a.reputation) {
        return b.reputation - a.reputation;
      }
      return a.load - b.load;
    });

    return qualified.slice(0, count);
  }

  /**
   * Get swarm health metrics
   */
  getSwarmHealth(): SwarmHealth {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status === 'idle' || a.status === 'busy');
    const degradedAgents = agents.filter(a => a.status === 'degraded' || a.status === 'error');
    const offlineAgents = agents.filter(a => a.status === 'offline');

    const totalLoad = agents.reduce((sum, a) => sum + a.load, 0);
    const averageLoad = agents.length > 0 ? totalLoad / agents.length : 0;

    const totalResponseTime = agents.reduce((sum, a) => sum + a.averageResponseTime, 0);
    const averageResponseTime = agents.length > 0 ? totalResponseTime / agents.length : 0;

    return {
      totalAgents: agents.length,
      activeAgents: activeAgents.length,
      degradedAgents: degradedAgents.length,
      offlineAgents: offlineAgents.length,
      averageLoad,
      messageQueueDepth: 0, // Would be populated by message bus
      pendingTasks: agents.reduce((sum, a) => sum + a.currentTasks.length, 0),
      inProgressTasks: agents.filter(a => a.status === 'busy').length,
      failedTasksLastHour: agents.reduce((sum, a) => sum + a.failedTasks, 0), // Simplified
      averageResponseTime,
      uptime: 0, // Would be calculated from swarm start time
    };
  }

  /**
   * Perform health checks on all agents
   */
  private performHealthChecks(): void {
    const now = Date.now();
    const heartbeatThreshold = this.heartbeatTimeout * 2; // Allow 2 missed heartbeats

    for (const [agentId, state] of this.agents.entries()) {
      const timeSinceHeartbeat = now - state.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > heartbeatThreshold && state.status !== 'offline') {
        logger.warn(`Agent ${agentId} missed heartbeat, marking as offline`);
        state.status = 'offline';
        this.emit('agent_status_changed', { agentId, status: 'offline' });
      }
    }
  }

  /**
   * Update indexes for a new agent
   */
  private updateIndexes(agentId: string, config: AgentConfig): void {
    // Update type index
    if (!this.typeIndex.has(config.type)) {
      this.typeIndex.set(config.type, new Set());
    }
    this.typeIndex.get(config.type)!.add(agentId);

    // Update capability index
    for (const capability of config.capabilities) {
      if (!this.capabilityIndex.has(capability.name)) {
        this.capabilityIndex.set(capability.name, new Set());
      }
      this.capabilityIndex.get(capability.name)!.add(agentId);
    }
  }

  /**
   * Remove agent from indexes
   */
  private removeFromIndexes(agentId: string, config: AgentConfig): void {
    // Remove from type index
    this.typeIndex.get(config.type)?.delete(agentId);

    // Remove from capability index
    for (const capability of config.capabilities) {
      this.capabilityIndex.get(capability.name)?.delete(agentId);
    }
  }

  /**
   * Shutdown the registry
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.agents.clear();
    this.capabilityIndex.clear();
    this.typeIndex.clear();

    logger.info('Agent registry shut down');
  }
}