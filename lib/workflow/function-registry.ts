import { PrismaClient } from '@prisma/client'
import type { BackendFunction } from './types'

const prisma = new PrismaClient()

export class FunctionRegistry {
  private functionImplementations: Map<string, (params: Record<string, unknown>) => Promise<unknown>>

  constructor() {
    this.functionImplementations = new Map()
    this.registerBuiltInFunctions()
  }

  /**
   * Register built-in backend functions
   */
  private registerBuiltInFunctions(): void {
    // Node management functions
    this.registerFunction('create_node', this.createNode.bind(this))
    this.registerFunction('delete_node', this.deleteNode.bind(this))
    this.registerFunction('update_node', this.updateNode.bind(this))
    this.registerFunction('list_nodes', this.listNodes.bind(this))

    // User management functions
    this.registerFunction('create_user', this.createUser.bind(this))
    this.registerFunction('delete_user', this.deleteUser.bind(this))
    this.registerFunction('list_users', this.listUsers.bind(this))

    // Configuration functions
    this.registerFunction('generate_config', this.generateConfig.bind(this))
    this.registerFunction('update_server_config', this.updateServerConfig.bind(this))

    // System functions
    this.registerFunction('check_status', this.checkStatus.bind(this))
    this.registerFunction('restart_service', this.restartService.bind(this))

    // Advanced/Agent functions
    this.registerFunction('complex_operation', this.executeComplexOperation.bind(this))
  }

  /**
   * Register a function implementation
   */
  registerFunction(name: string, implementation: (params: Record<string, unknown>) => Promise<unknown>): void {
    this.functionImplementations.set(name, implementation)
  }

  /**
   * Get all available functions
   */
  async getAllFunctions(): Promise<BackendFunction[]> {
    // Get functions from database
    const dbFunctions = await prisma.backendFunction.findMany({
      where: { enabled: true },
    })

    // If database is empty, return built-in function definitions
    if (dbFunctions.length === 0) {
      return this.getBuiltInFunctionDefinitions()
    }

    return dbFunctions.map(fn => ({
      id: fn.id,
      name: fn.name,
      description: fn.description,
      category: fn.category,
      parameters: fn.parameters as any,
      implementation: fn.implementation,
      requiresAuth: fn.requiresAuth,
      dangerous: fn.dangerous,
      enabled: fn.enabled,
    }))
  }

  /**
   * Get built-in function definitions
   */
  private getBuiltInFunctionDefinitions(): BackendFunction[] {
    return [
      {
        id: 'builtin-create_node',
        name: 'create_node',
        description: 'Create a new Hysteria2 node with specified configuration',
        category: 'node_management',
        parameters: [
          { name: 'name', type: 'string', description: 'Node name', required: true },
          { name: 'hostname', type: 'string', description: 'Node hostname or IP', required: true },
          { name: 'region', type: 'string', description: 'Node region', required: false },
          { name: 'tags', type: 'array', description: 'Node tags', required: false },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-delete_node',
        name: 'delete_node',
        description: 'Delete an existing Hysteria2 node',
        category: 'node_management',
        parameters: [
          { name: 'nodeId', type: 'string', description: 'Node ID to delete', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: true,
        enabled: true,
      },
      {
        id: 'builtin-update_node',
        name: 'update_node',
        description: 'Update an existing Hysteria2 node configuration',
        category: 'node_management',
        parameters: [
          { name: 'nodeId', type: 'string', description: 'Node ID to update', required: true },
          { name: 'name', type: 'string', description: 'New node name', required: false },
          { name: 'hostname', type: 'string', description: 'New hostname', required: false },
          { name: 'status', type: 'string', description: 'New status', required: false },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-list_nodes',
        name: 'list_nodes',
        description: 'List all Hysteria2 nodes with optional filtering',
        category: 'node_management',
        parameters: [
          { name: 'status', type: 'string', description: 'Filter by status', required: false },
          { name: 'tags', type: 'array', description: 'Filter by tags', required: false },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-create_user',
        name: 'create_user',
        description: 'Create a new client user',
        category: 'user_management',
        parameters: [
          { name: 'displayName', type: 'string', description: 'User display name', required: true },
          { name: 'quotaBytes', type: 'number', description: 'Quota in bytes', required: false },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-delete_user',
        name: 'delete_user',
        description: 'Delete a client user',
        category: 'user_management',
        parameters: [
          { name: 'userId', type: 'string', description: 'User ID to delete', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: true,
        enabled: true,
      },
      {
        id: 'builtin-generate_config',
        name: 'generate_config',
        description: 'Generate client configuration for a user',
        category: 'configuration',
        parameters: [
          { name: 'userId', type: 'string', description: 'User ID', required: true },
          { name: 'format', type: 'string', description: 'Config format (yaml, uri, clash, singbox)', required: false },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-check_status',
        name: 'check_status',
        description: 'Check system status and health',
        category: 'system',
        parameters: [],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-complex_operation',
        name: 'complex_operation',
        description: 'Execute a complex multi-step operation using the agent system',
        category: 'advanced',
        parameters: [
          { name: 'operation', type: 'string', description: 'Description of the complex operation', required: true },
          { name: 'context', type: 'object', description: 'Additional context for the operation', required: false },
        ],
        implementation: 'agent',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
    ]
  }

  /**
   * Execute a function by name
   */
  async executeFunction(functionName: string, parameters: Record<string, unknown>): Promise<unknown> {
    const implementation = this.functionImplementations.get(functionName)
    if (!implementation) {
      throw new Error(`Function ${functionName} not found`)
    }

    // For complex operations, delegate to agent system
    if (this.shouldUseAgent(functionName, parameters)) {
      return this.executeViaAgent(functionName, parameters)
    }

    return implementation(parameters)
  }

  /**
   * Determine if a function should be executed via the agent system
   */
  private shouldUseAgent(functionName: string, parameters: Record<string, unknown>): boolean {
    // Use agent for complex, multi-step operations
    const agentFunctions = [
      'complex_network_scan',
      'advanced_threat_analysis',
      'automated_response',
      'multi_step_operation',
    ]
    
    return agentFunctions.includes(functionName) || 
           (parameters as Record<string, unknown>)?.useAgent === true
  }

  /**
   * Execute a function via the agent system
   */
  private async executeViaAgent(functionName: string, parameters: Record<string, unknown>): Promise<unknown> {
    const { createAndStartTask, subscribe } = await import('../agents/runner')
    
    // Create a task for the agent
    const prompt = `Execute ${functionName} with parameters: ${JSON.stringify(parameters)}. 
    Use the available tools to complete this task. Report back the results.`

    const task = createAndStartTask(
      {
        prompt,
        allowedTools: ['*'], // Allow all tools for complex operations
        maxSteps: 20,
      },
      'system' // Created by system
    )

    // Wait for the task to complete
    return new Promise((resolve, reject) => {
      const unsubscribe = subscribe(task.id, (event) => {
        if (event.type === 'status') {
          if (event.status === 'succeeded') {
            unsubscribe()
            resolve({ success: true, taskId: task.id, result: task.result })
          } else if (event.status === 'failed') {
            unsubscribe()
            reject(new Error(task.error || 'Agent task failed'))
          } else if (event.status === 'cancelled') {
            unsubscribe()
            reject(new Error('Agent task was cancelled'))
          }
        }
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        unsubscribe()
        reject(new Error('Agent task timeout'))
      }, 5 * 60 * 1000)
    })
  }

  /* ------------------------------------------------------------------ */
  /*  Built-in Function Implementations                                  */
  /* ------------------------------------------------------------------ */

  private async createNode(params: Record<string, unknown>): Promise<unknown> {
    const { name, hostname, region, tags } = params

    if (!name || !hostname) {
      throw new Error('name and hostname are required')
    }

    const node = await prisma.hysteriaNode.create({
      data: {
        name: name as string,
        hostname: hostname as string,
        region: region as string | null,
        tags: JSON.stringify(tags || []),
        status: 'stopped',
      },
    })

    return { success: true, node }
  }

  private async deleteNode(params: Record<string, unknown>): Promise<unknown> {
    const { nodeId } = params

    if (!nodeId) {
      throw new Error('nodeId is required')
    }

    await prisma.hysteriaNode.delete({
      where: { id: nodeId as string },
    })

    return { success: true, message: 'Node deleted successfully' }
  }

  private async updateNode(params: Record<string, unknown>): Promise<unknown> {
    const { nodeId, name, hostname, status } = params

    if (!nodeId) {
      throw new Error('nodeId is required')
    }

    const updateData: Record<string, unknown> = {}
    if (name) updateData.name = name
    if (hostname) updateData.hostname = hostname
    if (status) updateData.status = status

    const node = await prisma.hysteriaNode.update({
      where: { id: nodeId as string },
      data: updateData,
    })

    return { success: true, node }
  }

  private async listNodes(params: Record<string, unknown>): Promise<unknown> {
    const { status, tags } = params

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (tags) where.tags = { contains: JSON.stringify(tags) }

    const nodes = await prisma.hysteriaNode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return { success: true, nodes, count: nodes.length }
  }

  private async createUser(params: Record<string, unknown>): Promise<unknown> {
    const { displayName, quotaBytes } = params

    if (!displayName) {
      throw new Error('displayName is required')
    }

    const user = await prisma.clientUser.create({
      data: {
        displayName: displayName as string,
        authToken: this.generateAuthToken(),
        quotaBytes: quotaBytes ? BigInt(quotaBytes as number) : null,
        status: 'active',
      },
    })

    return { success: true, user }
  }

  private async deleteUser(params: Record<string, unknown>): Promise<unknown> {
    const { userId } = params

    if (!userId) {
      throw new Error('userId is required')
    }

    await prisma.clientUser.delete({
      where: { id: userId as string },
    })

    return { success: true, message: 'User deleted successfully' }
  }

  private async listUsers(params: Record<string, unknown>): Promise<unknown> {
    const users = await prisma.clientUser.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return { success: true, users, count: users.length }
  }

  private async generateConfig(params: Record<string, unknown>): Promise<unknown> {
    const { userId, format } = params

    if (!userId) {
      throw new Error('userId is required')
    }

    // This would integrate with the existing config generation logic
    // For now, return a placeholder
    return {
      success: true,
      message: 'Config generation would be implemented here',
      userId,
      format: format || 'yaml',
    }
  }

  private async updateServerConfig(params: Record<string, unknown>): Promise<unknown> {
    // This would update the Hysteria2 server configuration
    return {
      success: true,
      message: 'Server config update would be implemented here',
      params,
    }
  }

  private async checkStatus(params: Record<string, unknown>): Promise<unknown> {
    const nodeCount = await prisma.hysteriaNode.count()
    const userCount = await prisma.clientUser.count()

    return {
      success: true,
      status: 'healthy',
      metrics: {
        nodes: nodeCount,
        users: userCount,
        timestamp: new Date().toISOString(),
      },
    }
  }

  private async restartService(params: Record<string, unknown>): Promise<unknown> {
    // This would restart the Hysteria2 service
    return {
      success: true,
      message: 'Service restart would be implemented here',
      params,
    }
  }

  private async executeComplexOperation(params: Record<string, unknown>): Promise<unknown> {
    const { operation, context } = params

    if (!operation) {
      throw new Error('operation description is required')
    }

    // Delegate to agent system with useAgent flag
    return this.executeViaAgent('complex_operation', {
      operation,
      context,
      useAgent: true,
    })
  }

  /**
   * Generate a random auth token
   */
  private generateAuthToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15)
  }
}