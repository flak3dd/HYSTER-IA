/**
 * Swarm Coordinator
 * Central orchestration engine for multi-agent operations
 * Handles operation planning, agent selection, task assignment, and coordination
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  SwarmOperation, 
  SwarmTask, 
  AgentConfig, 
  AgentState, 
  AgentType,
  SwarmHealth,
  SwarmEvent,
  CollaborativeReasoningSession
} from '../types';
import { AgentRegistry } from '../agent-registry';
import { MessageBus } from '../communication/message-bus';
import { MessageFactory } from '../communication/message-builder';
import { logger } from '../../logger';
import { cotEngine } from '../../ai/reasoning/chain-of-thought';
import { metaCognitionEngine } from '../../ai/reasoning/meta-cognition';

export class SwarmCoordinator extends EventEmitter {
  private registry: AgentRegistry;
  private messageBus: MessageBus;
  private operations: Map<string, SwarmOperation>;
  private activeTasks: Map<string, SwarmTask>;
  private isRunning: boolean;
  private enableReasoning: boolean;
  private collaborativeReasoningSessions: Map<string, CollaborativeReasoningSession>;

  constructor(registry: AgentRegistry, messageBus: MessageBus, enableReasoning: boolean = true) {
    super();
    this.registry = registry;
    this.messageBus = messageBus;
    this.operations = new Map();
    this.activeTasks = new Map();
    this.isRunning = false;
    this.enableReasoning = enableReasoning;
    this.collaborativeReasoningSessions = new Map();
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    logger.info('Swarm coordinator initializing');
    
    // Register message handlers
    this.messageBus.registerHandler('coordinator', this.handleMessage.bind(this));
    
    this.isRunning = true;
    logger.info('Swarm coordinator initialized');
  }

  /**
   * Create a new operation
   */
  async createOperation(
    name: string,
    description: string,
    objectives: string[],
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
    createdBy: string,
    constraints?: any
  ): Promise<SwarmOperation> {
    const operation: SwarmOperation = {
      id: uuidv4(),
      name,
      description,
      objectives,
      status: 'planning',
      priority,
      tasks: [],
      assignedAgents: [],
      createdAt: new Date(),
      createdBy,
      constraints: constraints || {
        maxDuration: 3600000, // 1 hour default
        maxResourceUsage: 80,
        allowedAgentTypes: [],
        riskTolerance: 'medium',
      },
    };

    this.operations.set(operation.id, operation);
    
    this.emitEvent('operation_created', { operation });
    logger.info(`Operation ${operation.id} created: ${name}`);

    return operation;
  }

  /**
   * Plan operation tasks
   */
  async planOperation(operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    logger.info(`Planning operation ${operationId}`);
    operation.status = 'planning';

    // Use reasoning for task decomposition if enabled
    let tasks: SwarmTask[];
    if (this.enableReasoning) {
      tasks = await this.reasoningBasedDecomposition(operation);
    } else {
      tasks = await this.decomposeObjectives(operation.objectives, operation.constraints);
    }
    
    // Resolve task dependencies
    await this.resolveDependencies(tasks);

    // Assign tasks to operation
    operation.tasks = tasks;

    this.emitEvent('operation_planned', { operationId, tasks });
    logger.info(`Operation ${operationId} planned with ${tasks.length} tasks`);
  }

  /**
   * Execute operation
   */
  async executeOperation(operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (operation.status !== 'planning') {
      throw new Error(`Operation ${operationId} is not in planning state`);
    }

    logger.info(`Executing operation ${operationId}`);
    operation.status = 'executing';
    operation.startedAt = new Date();

    this.emitEvent('operation_started', { operationId });

    // Select agents for tasks
    await this.assignAgentsToTasks(operation);

    // Execute tasks in dependency order
    await this.executeTasks(operation);
  }

  /**
   * Decompose objectives into tasks
   */
  private async decomObjectives(objectives: string[], constraints: any): Promise<SwarmTask[]> {
    const tasks: SwarmTask[] = [];

    for (const objective of objectives) {
      // Use LLM to decompose objective into tasks
      const objectiveTasks = await this.llmDecomposeObjective(objective, constraints);
      tasks.push(...objectiveTasks);
    }

    return tasks;
  }

  /**
   * Reasoning-based task decomposition using Chain-of-Thought
   */
  private async reasoningBasedDecomposition(operation: SwarmOperation): Promise<SwarmTask[]> {
    const operationContext = {
      name: operation.name,
      description: operation.description,
      objectives: operation.objectives,
      constraints: operation.constraints,
      riskTolerance: operation.constraints.riskTolerance,
    };

    try {
      // Use chain-of-thought for systematic decomposition
      const cotResult = await cotEngine.reason(
        JSON.stringify(operationContext),
        { 
          context: 'operation_decomposition',
          operationId: operation.id,
        },
        this.getCoordinatorTools()
      );

      // Extract tasks from reasoning
      const tasks = this.extractTasksFromReasoning(cotResult, operation);
      
      logger.info(`Reasoning-based decomposition completed for operation ${operation.id}`);
      return tasks;
    } catch (error) {
      logger.error(`Reasoning-based decomposition failed for operation ${operation.id}, falling back to standard decomposition`, error);
      return this.decomposeObjectives(operation.objectives, operation.constraints);
    }
  }

  /**
   * Extract tasks from chain-of-thought reasoning
   */
  private extractTasksFromReasoning(cotResult: any, operation: SwarmOperation): SwarmTask[] {
    const tasks: SwarmTask[] = [];
    
    // Parse the reasoning result to extract structured tasks
    // This is a simplified implementation - would use more sophisticated parsing in production
    try {
      const reasoningText = cotResult.finalAnswer;
      const taskMatches = reasoningText.match(/Task \d+: ([^\n]+)/g) || [];
      
      for (let i = 0; i < taskMatches.length; i++) {
        const match = taskMatches[i];
        const description = match.replace(/Task \d+: /, '');
        
        const task: SwarmTask = {
          id: uuidv4(),
          operationId: operation.id,
          title: `Task ${i + 1}`,
          description,
          type: this.inferTaskType(description),
          priority: operation.priority,
          requiredCapabilities: this.inferRequiredCapabilities(description),
          status: 'pending',
          dependencies: [],
          estimatedDuration: this.estimateTaskDuration(description),
          createdAt: new Date(),
        };
        
        tasks.push(task);
      }
    } catch (error) {
      logger.error('Error extracting tasks from reasoning', error);
    }
    
    return tasks;
  }

  /**
   * Infer task type from description
   */
  private inferTaskType(description: string): string {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('recon') || lowerDesc.includes('scan') || lowerDesc.includes('gather')) {
      return 'reconnaissance';
    } else if (lowerDesc.includes('evade') || lowerDesc.includes('stealth') || lowerDesc.includes('hide')) {
      return 'evasion';
    } else if (lowerDesc.includes('exfil') || lowerDesc.includes('extract') || lowerDesc.includes('transfer')) {
      return 'exfiltration';
    } else if (lowerDesc.includes('persist') || lowerDesc.includes('maintain') || lowerDesc.includes('backup')) {
      return 'persistence';
    } else if (lowerDesc.includes('move') || lowerDesc.includes('lateral') || lowerDesc.includes('traverse')) {
      return 'lateral_movement';
    } else {
      return 'general';
    }
  }

  /**
   * Infer required capabilities from description
   */
  private inferRequiredCapabilities(description: string): string[] {
    const capabilities: string[] = [];
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('network') || lowerDesc.includes('scan')) {
      capabilities.push('network_scanning');
    }
    if (lowerDesc.includes('vulnerability')) {
      capabilities.push('vulnerability_assessment');
    }
    if (lowerDesc.includes('osint')) {
      capabilities.push('osint_gathering');
    }
    if (lowerDesc.includes('encrypt')) {
      capabilities.push('encryption');
    }
    if (lowerDesc.includes('covert')) {
      capabilities.push('covert_channels');
    }
    
    return capabilities.length > 0 ? capabilities : ['general'];
  }

  /**
   * Estimate task duration based on description
   */
  private estimateTaskDuration(description: string): number {
    const complexity = description.length;
    // Simple heuristic: 1 second per 10 characters, minimum 30 seconds
    return Math.max(30000, complexity * 1000);
  }

  /**
   * Resolve task dependencies
   */
  private async resolveDependencies(tasks: SwarmTask[]): Promise<void> {
    // Use LLM to identify dependencies between tasks
    for (const task of tasks) {
      const dependencies = await this.llmIdentifyDependencies(task, tasks);
      task.dependencies = dependencies;
    }
  }

  /**
   * Assign agents to tasks
   */
  private async assignAgentsToTasks(operation: SwarmOperation): Promise<void> {
    for (const task of operation.tasks) {
      if (task.status === 'pending') {
        const agent = this.enableReasoning 
          ? await this.reasoningBasedAgentSelection(task, operation)
          : this.selectAgentForTask(task, operation.constraints);
        
        if (agent) {
          task.assignedAgent = agent.config.id;
          task.status = 'assigned';
          operation.assignedAgents.push(agent.config.id);
          
          this.emitEvent('task_assigned', { taskId: task.id, agentId: agent.config.id });
        } else {
          logger.warn(`No agent available for task ${task.id}`);
          task.status = 'failed';
          task.error = 'No agent available';
        }
      }
    }
  }

  /**
   * Execute tasks in dependency order
   */
  private async executeTasks(operation: SwarmOperation): Promise<void> {
    const executedTasks = new Set<string>();
    let completedTasks = 0;

    while (completedTasks < operation.tasks.length) {
      // Find tasks ready to execute (dependencies met)
      const readyTasks = operation.tasks.filter(task => 
        task.status === 'assigned' && 
        task.dependencies.every(dep => executedTasks.has(dep))
      );

      if (readyTasks.length === 0) {
        // Check if we're stuck
        const pendingTasks = operation.tasks.filter(t => t.status === 'assigned');
        if (pendingTasks.length === 0) {
          break; // No more tasks to execute
        }
        
        // Wait for dependencies
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // Execute ready tasks in parallel
      const executionPromises = readyTasks.map(task => this.executeTask(task));
      await Promise.all(executionPromises);

      // Mark tasks as completed
      for (const task of readyTasks) {
        if (task.status === 'completed') {
          executedTasks.add(task.id);
          completedTasks++;
        }
      }
    }

    // Update operation status
    const failedTasks = operation.tasks.filter(t => t.status === 'failed');
    if (failedTasks.length === 0) {
      operation.status = 'completed';
      operation.completedAt = new Date();
      this.emitEvent('operation_completed', { operationId: operation.id });
    } else {
      operation.status = 'failed';
      operation.completedAt = new Date();
      this.emitEvent('operation_failed', { operationId: operation.id, failedTasks });
    }

    logger.info(`Operation ${operation.id} completed with status: ${operation.status}`);
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: SwarmTask): Promise<void> {
    if (!task.assignedAgent) {
      task.status = 'failed';
      task.error = 'No agent assigned';
      return;
    }

    task.status = 'in_progress';
    task.startedAt = new Date();
    this.activeTasks.set(task.id, task);

    this.emitEvent('task_started', { taskId: task.id });

    try {
      // Send task to agent
      const message = MessageFactory.request(
        'coordinator',
        task.assignedAgent,
        'task_request',
        task,
        task.priority as any
      );

      await this.messageBus.sendMessage(message);

      // Wait for response (simplified - in production would use async response handling)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update task status
      task.status = 'completed';
      task.completedAt = new Date();
      task.actualDuration = task.completedAt.getTime() - task.startedAt.getTime();

      this.emitEvent('task_completed', { taskId: task.id, result: task.result });

    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      task.completedAt = new Date();
      
      this.emitEvent('task_failed', { taskId: task.id, error: task.error });
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Select agent for task
   */
  private selectAgentForTask(task: SwarmTask, constraints: any): AgentState | null {
    const requiredCapabilities = task.requiredCapabilities || [];
    const allowedTypes = constraints.allowedAgentTypes || [];

    let agents = this.registry.getAllAgents();

    // Filter by allowed types
    if (allowedTypes.length > 0) {
      agents = agents.filter(a => allowedTypes.includes(a.config.type));
    }

    // Filter by capabilities
    if (requiredCapabilities.length > 0) {
      agents = agents.filter(a => {
        const agentCapabilities = new Set(a.config.capabilities.map(c => c.name));
        return requiredCapabilities.every(cap => agentCapabilities.has(cap));
      });
    }

    // Filter by status
    agents = agents.filter(a => a.status === 'idle' || a.status === 'busy');

    // Sort by reputation and load
    agents.sort((a, b) => {
      if (b.reputation !== a.reputation) {
        return b.reputation - a.reputation;
      }
      return a.load - b.load;
    });

    return agents.length > 0 ? agents[0] : null;
  }

  /**
   * Reasoning-based agent selection using meta-cognition
   */
  private async reasoningBasedAgentSelection(task: SwarmTask, operation: SwarmOperation): Promise<AgentState | null> {
    const availableAgents = this.getAvailableAgents(task, operation.constraints);
    
    if (availableAgents.length === 0) {
      return null;
    }

    // If only one agent available, return it
    if (availableAgents.length === 1) {
      return availableAgents[0];
    }

    // Use meta-cognition to assess uncertainty in agent selection
    try {
      const assessment = await metaCognitionEngine.assessUncertainty(
        JSON.stringify({
          task: task.description,
          taskType: task.type,
          requiredCapabilities: task.requiredCapabilities,
          availableAgents: availableAgents.map(a => ({
            id: a.config.id,
            type: a.config.type,
            reputation: a.reputation,
            load: a.load,
            capabilities: a.config.capabilities.map(c => c.name),
          })),
        }),
        { context: 'agent_selection', taskId: task.id }
      );

      // If high uncertainty, use chain-of-thought for deeper analysis
      if (assessment.confidence < 0.7) {
        const cotResult = await cotEngine.reason(
          JSON.stringify({
            task: task.description,
            agents: availableAgents.map(a => ({
              id: a.config.id,
              type: a.config.type,
              reputation: a.reputation,
              load: a.load,
              capabilities: a.config.capabilities,
            })),
          }),
          { context: 'agent_selection', taskId: task.id },
          this.getCoordinatorTools()
        );

        // Parse reasoning to select best agent
        const selectedAgentId = this.extractAgentIdFromReasoning(cotResult, availableAgents);
        const selectedAgent = availableAgents.find(a => a.config.id === selectedAgentId);
        return selectedAgent || availableAgents[0];
      }

      // Otherwise, use standard selection with confidence weighting
      return this.selectAgentWithConfidence(availableAgents, assessment.confidence);
    } catch (error) {
      logger.error('Reasoning-based agent selection failed, falling back to standard selection', error);
      return this.selectAgentForTask(task, operation.constraints);
    }
  }

  /**
   * Get available agents for a task
   */
  private getAvailableAgents(task: SwarmTask, constraints: any): AgentState[] {
    const requiredCapabilities = task.requiredCapabilities || [];
    const allowedTypes = constraints.allowedAgentTypes || [];

    let agents = this.registry.getAllAgents();

    // Filter by allowed types
    if (allowedTypes.length > 0) {
      agents = agents.filter(a => allowedTypes.includes(a.config.type));
    }

    // Filter by capabilities
    if (requiredCapabilities.length > 0) {
      agents = agents.filter(a => {
        const agentCapabilities = new Set(a.config.capabilities.map(c => c.name));
        return requiredCapabilities.every(cap => agentCapabilities.has(cap));
      });
    }

    // Filter by status
    agents = agents.filter(a => a.status === 'idle' || a.status === 'busy');

    return agents;
  }

  /**
   * Select agent with confidence weighting
   */
  private selectAgentWithConfidence(agents: AgentState[], confidence: number): AgentState {
    // Sort by reputation and load, but add randomness based on confidence
    const sortedAgents = [...agents].sort((a, b) => {
      if (b.reputation !== a.reputation) {
        return b.reputation - a.reputation;
      }
      return a.load - b.load;
    });

    // If confidence is high, pick the best agent
    if (confidence > 0.8) {
      return sortedAgents[0];
    }

    // If confidence is moderate, pick from top 3
    const topN = Math.min(3, sortedAgents.length);
    const selectedIndex = Math.floor(Math.random() * topN);
    return sortedAgents[selectedIndex];
  }

  /**
   * Extract agent ID from reasoning
   */
  private extractAgentIdFromReasoning(cotResult: any, availableAgents: AgentState[]): string {
    // Simple implementation - extract agent ID from reasoning text
    const reasoningText = cotResult.finalAnswer.toLowerCase();
    
    for (const agent of availableAgents) {
      if (reasoningText.includes(agent.config.id.toLowerCase())) {
        return agent.config.id;
      }
    }

    // Default to first agent if no match found
    return availableAgents[0].config.id;
  }

  /**
   * Get coordinator tools for chain-of-thought reasoning
   */
  private getCoordinatorTools(): any[] {
    return [
      {
        name: 'get_agent_states',
        description: 'Get current states of all agents',
        input_schema: { type: 'object' },
      },
      {
        name: 'get_agent_capabilities',
        description: 'Get capabilities of specific agents',
        input_schema: { type: 'object' },
      },
      {
        name: 'analyze_task_complexity',
        description: 'Analyze the complexity of a task',
        input_schema: { type: 'object' },
      },
    ];
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: any): Promise<void> {
    const { payload } = message;

    switch (payload.type) {
      case 'task_result':
        await this.handleTaskResult(payload.data);
        break;
      case 'task_error':
        await this.handleTaskError(payload.data);
        break;
      case 'operation_status':
        await this.handleOperationStatus(message.fromAgent, payload.data);
        break;
      default:
        logger.warn(`Unknown message type: ${payload.type}`);
    }
  }

  /**
   * Handle task result
   */
  private async handleTaskResult(data: any): Promise<void> {
    const task = this.activeTasks.get(data.taskId);
    if (task) {
      task.result = data.result;
      task.status = 'completed';
      task.completedAt = new Date();
      task.actualDuration = data.duration;
      
      this.emitEvent('task_completed', { taskId: task.id, result: task.result });
    }
  }

  /**
   * Handle task error
   */
  private async handleTaskError(data: any): Promise<void> {
    const task = this.activeTasks.get(data.taskId);
    if (task) {
      task.status = 'failed';
      task.error = data.error;
      task.completedAt = new Date();
      
      this.emitEvent('task_failed', { taskId: task.id, error: task.error });
    }
  }

  /**
   * Handle operation status request
   */
  private async handleOperationStatus(agentId: string, data: any): Promise<void> {
    const operation = this.operations.get(data.operationId);
    if (operation) {
      const response = MessageFactory.response(
        'coordinator',
        agentId,
        'operation_status_response',
        operation
      );
      await this.messageBus.sendMessage(response);
    }
  }

  /**
   * Get operation status
   */
  getOperation(operationId: string): SwarmOperation | undefined {
    return this.operations.get(operationId);
  }

  /**
   * Get all operations
   */
  getAllOperations(): SwarmOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get swarm health
   */
  getSwarmHealth(): SwarmHealth {
    return this.registry.getSwarmHealth();
  }

  /**
   * Cancel operation
   */
  async cancelOperation(operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // Cancel all active tasks
    for (const task of operation.tasks) {
      if (task.status === 'in_progress' || task.status === 'assigned') {
        task.status = 'failed';
        task.error = 'Operation cancelled';
      }
    }

    operation.status = 'failed';
    operation.completedAt = new Date();

    this.emitEvent('operation_failed', { operationId, reason: 'Cancelled' });
    logger.info(`Operation ${operationId} cancelled`);
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    
    // Cancel all active operations
    for (const operation of this.operations.values()) {
      if (operation.status === 'executing') {
        await this.cancelOperation(operation.id);
      }
    }

    this.operations.clear();
    this.activeTasks.clear();
    this.messageBus.unregisterHandler('coordinator');

    logger.info('Swarm coordinator shut down');
  }

  // LLM integration methods (simplified)

  private async llmDecomposeObjective(objective: string, constraints: any): Promise<SwarmTask[]> {
    // In production, would use LLM to decompose objective
    return [{
      id: uuidv4(),
      operationId: '',
      title: `Execute: ${objective}`,
      description: objective,
      type: 'general',
      priority: 'normal',
      requiredCapabilities: [],
      status: 'pending',
      dependencies: [],
      estimatedDuration: 60000,
      createdAt: new Date(),
    }];
  }

  private async llmIdentifyDependencies(task: SwarmTask, allTasks: SwarmTask[]): Promise<string[]> {
    // In production, would use LLM to identify dependencies
    return [];
  }

  /**
   * Emit swarm event
   */
  private emitEvent(type: string, data: any): void {
    const event: SwarmEvent = {
      id: uuidv4(),
      type: type as any,
      timestamp: new Date(),
      source: 'coordinator',
      data,
    };
    this.emit('swarm_event', event);
  }
}