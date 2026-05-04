import { PrismaClient } from '@prisma/client'
import type { BackendFunction } from './types'
import { runAiTool } from '@/lib/ai/tools'

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

    // OSINT functions
    this.registerFunction('enumerate_domain', this.enumerateDomain.bind(this))
    this.registerFunction('analyze_subdomains', this.analyzeSubdomains.bind(this))
    this.registerFunction('whois_lookup', this.performWhoisLookup.bind(this))

    // Threat intelligence functions
    this.registerFunction('analyze_ip_threats', this.analyzeIpThreats.bind(this))
    this.registerFunction('analyze_domain_threats', this.analyzeDomainThreats.bind(this))
    this.registerFunction('analyze_url_threats', this.analyzeUrlThreats.bind(this))
    this.registerFunction('analyze_file_threats', this.analyzeFileThreats.bind(this))
    this.registerFunction('generate_threat_report', this.generateThreatReport.bind(this))

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
        description: 'Generate a Hysteria2 server configuration YAML from a natural language description',
        category: 'configuration',
        parameters: [
          { name: 'description', type: 'string', description: 'Natural language description of the desired Hysteria2 server config', required: true },
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
      {
        id: 'builtin-enumerate_domain',
        name: 'enumerate_domain',
        description: 'Perform comprehensive domain enumeration including subdomain discovery, DNS records, and WHOIS',
        category: 'osint',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain to enumerate', required: true },
          { name: 'includeCrtSh', type: 'boolean', description: 'Include certificate transparency search', required: false },
          { name: 'includeDnsEnum', type: 'boolean', description: 'Include DNS enumeration', required: false },
          { name: 'includeWhois', type: 'boolean', description: 'Include WHOIS lookup', required: false },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-analyze_subdomains',
        name: 'analyze_subdomains',
        description: 'Analyze discovered subdomains for additional information',
        category: 'osint',
        parameters: [
          { name: 'subdomains', type: 'array', description: 'List of subdomains to analyze', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-whois_lookup',
        name: 'whois_lookup',
        description: 'Perform WHOIS lookup for a domain',
        category: 'osint',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain for WHOIS lookup', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-analyze_ip_threats',
        name: 'analyze_ip_threats',
        description: 'Analyze IP address for threats using VirusTotal and AlienVault OTX',
        category: 'threat_intel',
        parameters: [
          { name: 'ip', type: 'string', description: 'IP address to analyze', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-analyze_domain_threats',
        name: 'analyze_domain_threats',
        description: 'Analyze domain for threats using VirusTotal and AlienVault OTX',
        category: 'threat_intel',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain to analyze', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-analyze_url_threats',
        name: 'analyze_url_threats',
        description: 'Analyze URL for threats using VirusTotal and AlienVault OTX',
        category: 'threat_intel',
        parameters: [
          { name: 'url', type: 'string', description: 'URL to analyze', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-analyze_file_threats',
        name: 'analyze_file_threats',
        description: 'Analyze file hash for threats using VirusTotal and AlienVault OTX',
        category: 'threat_intel',
        parameters: [
          { name: 'hash', type: 'string', description: 'File hash (MD5, SHA1, or SHA256)', required: true },
        ],
        implementation: 'builtin',
        requiresAuth: true,
        dangerous: false,
        enabled: true,
      },
      {
        id: 'builtin-generate_threat_report',
        name: 'generate_threat_report',
        description: 'Generate comprehensive threat report from multiple analysis results',
        category: 'threat_intel',
        parameters: [
          { name: 'analysisResults', type: 'object', description: 'Combined analysis results', required: true },
        ],
        implementation: 'builtin',
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
    // Agent system has been removed - always return false
    return false
  }

  /**
   * Execute a function via the agent system
   */
  private async executeViaAgent(functionName: string, parameters: Record<string, unknown>): Promise<unknown> {
    // Agent system has been removed
    throw new Error('Agent execution is no longer available. Please use the AI Assistant page at /admin/ai for AI-driven tasks.')
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
    const { description } = params

    if (!description || typeof description !== 'string') {
      throw new Error('description is required and must be a string')
    }

    try {
      const ctx = {
        metadata: { source: 'workflow-function-registry' },
      }
      const result = await runAiTool('generate_config', { description }, ctx)
      return {
        success: true,
        config: result,
      }
    } catch (error) {
      throw new Error(`Config generation failed: ${error instanceof Error ? error.message : String(error)}`)
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

  /* ------------------------------------------------------------------ */
  /*  OSINT Function Implementations                                     */
  /* ------------------------------------------------------------------ */

  private async enumerateDomain(params: Record<string, unknown>): Promise<unknown> {
    const { domain, includeCrtSh = true, includeDnsEnum = true, includeWhois = true } = params

    if (!domain || typeof domain !== 'string') {
      throw new Error('domain is required and must be a string')
    }

    try {
      const { enumerateDomain } = await import('../osint/domain-enum')
      const result = await enumerateDomain(domain as string, {
        includeCrtSh: includeCrtSh as boolean,
        includeDnsEnum: includeDnsEnum as boolean,
        includeWhois: includeWhois as boolean,
      })

      return {
        success: true,
        domain,
        subdomainCount: result.subdomains.reduce((acc, s) => acc + s.subdomains.length, 0),
        dnsRecordCount: result.dnsRecords.length,
        whoisData: result.whois ? 'Available' : 'Not available',
        timestamp: new Date(result.timestamp).toISOString(),
        result,
      }
    } catch (error) {
      throw new Error(`Domain enumeration failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async analyzeSubdomains(params: Record<string, unknown>): Promise<unknown> {
    const { subdomains } = params

    if (!subdomains || !Array.isArray(subdomains)) {
      throw new Error('subdomains is required and must be an array')
    }

    try {
      const { enumerateDnsRecords } = await import('../osint/domain-enum')
      const analysisResults = []

      for (const subdomain of subdomains.slice(0, 10)) { // Limit to 10 for performance
        try {
          const dnsRecords = await enumerateDnsRecords(subdomain as string)
          analysisResults.push({
            subdomain,
            recordCount: dnsRecords.length,
            hasHttps: dnsRecords.some(r => r.type === 'CNAME' || r.type === 'A'),
            records: dnsRecords,
          })
        } catch (error) {
          analysisResults.push({
            subdomain,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      return {
        success: true,
        analyzedCount: analysisResults.length,
        results: analysisResults,
      }
    } catch (error) {
      throw new Error(`Subdomain analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async performWhoisLookup(params: Record<string, unknown>): Promise<unknown> {
    const { domain } = params

    if (!domain || typeof domain !== 'string') {
      throw new Error('domain is required and must be a string')
    }

    try {
      const { whoisLookup } = await import('../osint/domain-enum')
      const result = await whoisLookup(domain as string)

      return {
        success: true,
        domain,
        registrar: result.registrar,
        createdDate: result.createdDate,
        expiryDate: result.expiryDate,
        nameServers: result.nameServers,
        registrant: result.registrant,
      }
    } catch (error) {
      throw new Error(`WHOIS lookup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Threat Intelligence Function Implementations                        */
  /* ------------------------------------------------------------------ */

  private async analyzeIpThreats(params: Record<string, unknown>): Promise<unknown> {
    const { ip } = params

    if (!ip || typeof ip !== 'string') {
      throw new Error('ip is required and must be a string')
    }

    try {
      const { analyzeIpAddress } = await import('../threatintel/virustotal')
      const { analyzeOtxIpv4 } = await import('../threatintel/alienvault')

      const [vtResult, otxResult] = await Promise.all([
        analyzeIpAddress(ip as string).catch(err => ({ error: err.message } as any)),
        analyzeOtxIpv4(ip as string).catch(err => ({ error: err.message } as any)),
      ])

      return {
        success: true,
        ip,
        virusTotal: (vtResult as any).error ? { error: (vtResult as any).error } : {
          malicious: vtResult.malicious,
          detectionPercentage: vtResult.detectionPercentage,
          reputation: vtResult.reputation,
          country: vtResult.country,
        },
        alienVault: (otxResult as any).error ? { error: (otxResult as any).error } : {
          reputation: otxResult.reputation,
          severity: otxResult.severity,
          malicious: otxResult.malicious,
          pulseCount: otxResult.pulseCount,
        },
        overallRisk: this.calculateOverallRisk(vtResult, otxResult),
      }
    } catch (error) {
      throw new Error(`IP threat analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async analyzeDomainThreats(params: Record<string, unknown>): Promise<unknown> {
    const { domain } = params

    if (!domain || typeof domain !== 'string') {
      throw new Error('domain is required and must be a string')
    }

    try {
      const { analyzeDomain } = await import('../threatintel/virustotal')
      const { analyzeOtxDomain } = await import('../threatintel/alienvault')

      const [vtResult, otxResult] = await Promise.all([
        analyzeDomain(domain as string).catch(err => ({ error: err.message } as any)),
        analyzeOtxDomain(domain as string).catch(err => ({ error: err.message } as any)),
      ])

      return {
        success: true,
        domain,
        virusTotal: (vtResult as any).error ? { error: (vtResult as any).error } : {
          malicious: vtResult.malicious,
          detectionPercentage: vtResult.detectionPercentage,
          reputation: vtResult.reputation,
          categories: vtResult.categories,
        },
        alienVault: (otxResult as any).error ? { error: (otxResult as any).error } : {
          reputation: otxResult.reputation,
          severity: otxResult.severity,
          malicious: otxResult.malicious,
          pulseCount: otxResult.pulseCount,
        },
        overallRisk: this.calculateOverallRisk(vtResult, otxResult),
      }
    } catch (error) {
      throw new Error(`Domain threat analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async analyzeUrlThreats(params: Record<string, unknown>): Promise<unknown> {
    const { url } = params

    if (!url || typeof url !== 'string') {
      throw new Error('url is required and must be a string')
    }

    try {
      const { analyzeUrl } = await import('../threatintel/virustotal')
      const { analyzeOtxUrl } = await import('../threatintel/alienvault')

      const [vtResult, otxResult] = await Promise.all([
        analyzeUrl(url as string).catch(err => ({ error: err.message } as any)),
        analyzeOtxUrl(url as string).catch(err => ({ error: err.message } as any)),
      ])

      return {
        success: true,
        url,
        virusTotal: (vtResult as any).error ? { error: (vtResult as any).error } : {
          malicious: vtResult.malicious,
          detectionPercentage: vtResult.detectionPercentage,
          reputation: vtResult.reputation,
          categories: vtResult.categories,
        },
        alienVault: (otxResult as any).error ? { error: (otxResult as any).error } : {
          reputation: otxResult.reputation,
          severity: otxResult.severity,
          malicious: otxResult.malicious,
          pulseCount: otxResult.pulseCount,
        },
        overallRisk: this.calculateOverallRisk(vtResult, otxResult),
      }
    } catch (error) {
      throw new Error(`URL threat analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async analyzeFileThreats(params: Record<string, unknown>): Promise<unknown> {
    const { hash } = params

    if (!hash || typeof hash !== 'string') {
      throw new Error('hash is required and must be a string')
    }

    try {
      const { analyzeFileHash } = await import('../threatintel/virustotal')
      const { analyzeOtxFileHash } = await import('../threatintel/alienvault')

      const [vtResult, otxResult] = await Promise.all([
        analyzeFileHash(hash as string).catch(err => ({ error: err.message } as any)),
        analyzeOtxFileHash(hash as string).catch(err => ({ error: err.message } as any)),
      ])

      return {
        success: true,
        hash,
        virusTotal: (vtResult as any).error ? { error: (vtResult as any).error } : {
          malicious: vtResult.malicious,
          detectionPercentage: vtResult.detectionPercentage,
          reputation: vtResult.reputation,
        },
        alienVault: (otxResult as any).error ? { error: (otxResult as any).error } : {
          reputation: otxResult.reputation,
          severity: otxResult.severity,
          malicious: otxResult.malicious,
          pulseCount: otxResult.pulseCount,
        },
        overallRisk: this.calculateOverallRisk(vtResult, otxResult),
      }
    } catch (error) {
      throw new Error(`File threat analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async generateThreatReport(params: Record<string, unknown>): Promise<unknown> {
    const { analysisResults } = params

    if (!analysisResults || typeof analysisResults !== 'object') {
      throw new Error('analysisResults is required and must be an object')
    }

    const results = analysisResults as Record<string, unknown>
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalAnalyses: Object.keys(results).length,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
      },
      details: results,
      recommendations: [] as string[],
    }

    // Analyze results and generate recommendations
    for (const [key, value] of Object.entries(results)) {
      if (typeof value === 'object' && value !== null) {
        const result = value as { overallRisk?: string }
        if (result.overallRisk === 'high') {
          report.summary.highRiskCount++
          report.recommendations.push(`High risk detected for ${key}. Immediate investigation recommended.`)
        } else if (result.overallRisk === 'medium') {
          report.summary.mediumRiskCount++
          report.recommendations.push(`Medium risk detected for ${key}. Further monitoring recommended.`)
        } else if (result.overallRisk === 'low') {
          report.summary.lowRiskCount++
        }
      }
    }

    if (report.recommendations.length === 0) {
      report.recommendations.push('No significant threats detected. Continue monitoring.')
    }

    return {
      success: true,
      report,
    }
  }

  /**
   * Calculate overall risk from multiple sources
   */
  private calculateOverallRisk(vtResult: any, otxResult: any): string {
    let riskScore = 0

    // VirusTotal contribution
    if (!vtResult.error) {
      if (vtResult.malicious) riskScore += 3
      if (vtResult.detectionPercentage > 50) riskScore += 2
      if (vtResult.detectionPercentage > 25) riskScore += 1
      if (vtResult.reputation < 0) riskScore += 1
    }

    // AlienVault contribution
    if (!otxResult.error) {
      if (otxResult.malicious) riskScore += 2
      if (otxResult.pulseCount > 5) riskScore += 2
      if (otxResult.pulseCount > 2) riskScore += 1
      if (otxResult.reputation < 50) riskScore += 1
    }

    if (riskScore >= 5) return 'high'
    if (riskScore >= 2) return 'medium'
    return 'low'
  }
}