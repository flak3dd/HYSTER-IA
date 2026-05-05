import logger from '../../logger';

export interface AnalysisResult {
  success: boolean;
  analysisType: string;
  results: any;
  errors: string[];
  warnings: string[];
}

export interface AttackPathAnalysis {
  sourcePrincipal: string;
  targetPrincipal: string;
  paths: AttackPath[];
  shortestPath?: AttackPath;
  totalPaths: number;
  analysisTime: number;
}

export interface AttackPath {
  nodes: PathNode[];
  edges: PathEdge[];
  length: number;
  riskScore: number;
  estimatedTime: number;
}

export interface PathNode {
  objectId: string;
  name: string;
  type: string;
  domain?: string;
  labels?: string[];
}

export interface PathEdge {
  sourceId: string;
  targetId: string;
  edgeType: string;
  aclRights?: string[];
}

export interface PrivilegeEscalationOpportunity {
  principal: string;
  principalType: string;
  target: string;
  targetType: string;
  technique: string;
  riskScore: number;
  description: string;
  prerequisites: string[];
}

export interface DomainAnalysis {
  domainName: string;
  totalNodes: number;
  totalEdges: number;
  highValueTargets: string[];
  administrators: string[];
  domainControllers: string[];
  criticalPaths: AttackPath[];
}

// In-memory storage for BloodHound graph data
const nodes = new Map<string, PathNode>();
const edges = new Map<string, PathEdge[]>();

export class BloodHoundAnalyzer {
  /**
   * Load graph data
   */
  loadGraphData(graphNodes: PathNode[], graphEdges: PathEdge[]): void {
    nodes.clear();
    edges.clear();

    for (const node of graphNodes) {
      nodes.set(node.objectId, node);
    }

    for (const edge of graphEdges) {
      if (!edges.has(edge.sourceId)) {
        edges.set(edge.sourceId, []);
      }
      edges.get(edge.sourceId)!.push(edge);
    }

    logger.info(`Loaded ${nodes.size} nodes and ${graphEdges.length} edges`);
  }

  /**
   * Find shortest attack path between two principals
   */
  async findShortestPath(sourceObjectId: string, targetObjectId: string, maxDepth: number = 10): Promise<AnalysisResult> {
    const startTime = Date.now();
    const result: AnalysisResult = {
      success: false,
      analysisType: 'shortest_path',
      results: null,
      errors: [],
      warnings: []
    };

    try {
      logger.info(`Finding shortest path from ${sourceObjectId} to ${targetObjectId}`);

      const sourceNode = nodes.get(sourceObjectId);
      const targetNode = nodes.get(targetObjectId);

      if (!sourceNode) {
        throw new Error(`Source node ${sourceObjectId} not found`);
      }

      if (!targetNode) {
        throw new Error(`Target node ${targetObjectId} not found`);
      }

      // BFS to find shortest path
      const visited = new Set<string>();
      const queue: Array<{ nodeId: string; path: string[]; edgeList: PathEdge[] }> = [
        { nodeId: sourceObjectId, path: [sourceObjectId], edgeList: [] }
      ];
      visited.add(sourceObjectId);

      let foundPath: { nodeIds: string[]; edgeList: PathEdge[] } | null = null;

      while (queue.length > 0 && !foundPath) {
        const current = queue.shift()!;

        if (current.path.length > maxDepth) {
          continue;
        }

        // Check if we reached the target
        if (current.nodeId === targetObjectId) {
          foundPath = {
            nodeIds: current.path,
            edgeList: current.edgeList
          };
          break;
        }

        // Get outgoing edges
        const outgoingEdges = edges.get(current.nodeId) || [];

        for (const edge of outgoingEdges) {
          if (!visited.has(edge.targetId)) {
            visited.add(edge.targetId);
            queue.push({
              nodeId: edge.targetId,
              path: [...current.path, edge.targetId],
              edgeList: [...current.edgeList, edge]
            });
          }
        }
      }

      if (!foundPath) {
        result.warnings.push(`No path found between ${sourceObjectId} and ${targetObjectId} within depth ${maxDepth}`);
        result.results = {
          sourcePrincipal: sourceNode.name,
          targetPrincipal: targetNode.name,
          paths: [],
          totalPaths: 0,
          analysisTime: Date.now() - startTime
        };
        result.success = true;
        return result;
      }

      // Build path details
      const pathNodes = foundPath.nodeIds.map(id => nodes.get(id)!);
      const pathDetails: AttackPath = {
        nodes: pathNodes,
        edges: foundPath.edgeList,
        length: foundPath.nodeIds.length,
        riskScore: this.calculateRiskScore(foundPath.edgeList),
        estimatedTime: this.estimateExecutionTime(foundPath.edgeList)
      };

      result.results = {
        sourcePrincipal: sourceNode.name,
        targetPrincipal: targetNode.name,
        paths: [pathDetails],
        shortestPath: pathDetails,
        totalPaths: 1,
        analysisTime: Date.now() - startTime
      };
      result.success = true;

      logger.info(`Found shortest path with ${pathDetails.length} hops`);

      return result;
    } catch (error) {
      const errorMsg = `Shortest path analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg);
      return result;
    }
  }

  /**
   * Find all attack paths between two principals
   */
  async findAllPaths(sourceObjectId: string, targetObjectId: string, maxPaths: number = 10, maxDepth: number = 10): Promise<AnalysisResult> {
    const startTime = Date.now();
    const result: AnalysisResult = {
      success: false,
      analysisType: 'all_paths',
      results: null,
      errors: [],
      warnings: []
    };

    try {
      logger.info(`Finding all paths from ${sourceObjectId} to ${targetObjectId}`);

      const sourceNode = nodes.get(sourceObjectId);
      const targetNode = nodes.get(targetObjectId);

      if (!sourceNode || !targetNode) {
        throw new Error('Source or target node not found');
      }

      // DFS to find all paths
      const allPaths: Array<{ nodeIds: string[]; edgeList: PathEdge[] }> = [];
      const visited = new Set<string>();

      const dfs = (currentNodeId: string, path: string[], edgeList: PathEdge[], depth: number) => {
        if (allPaths.length >= maxPaths || depth > maxDepth) {
          return;
        }

        if (currentNodeId === targetObjectId) {
          allPaths.push({ nodeIds: [...path], edgeList: [...edgeList] });
          return;
        }

        visited.add(currentNodeId);

        const outgoingEdges = edges.get(currentNodeId) || [];

        for (const edge of outgoingEdges) {
          if (!visited.has(edge.targetId)) {
            dfs(edge.targetId, [...path, edge.targetId], [...edgeList, edge], depth + 1);
          }
        }

        visited.delete(currentNodeId);
      };

      dfs(sourceObjectId, [sourceObjectId], [], 0);

      // Build path details
      const pathDetails: AttackPath[] = [];
      for (const path of allPaths) {
        const pathNodes = path.nodeIds.map(id => nodes.get(id)!);

        pathDetails.push({
          nodes: pathNodes,
          edges: path.edgeList,
          length: path.nodeIds.length,
          riskScore: this.calculateRiskScore(path.edgeList),
          estimatedTime: this.estimateExecutionTime(path.edgeList)
        });
      }

      // Find shortest path
      const shortestPath = pathDetails.sort((a, b) => a.length - b.length)[0];

      result.results = {
        sourcePrincipal: sourceNode.name,
        targetPrincipal: targetNode.name,
        paths: pathDetails,
        shortestPath,
        totalPaths: pathDetails.length,
        analysisTime: Date.now() - startTime
      };
      result.success = true;

      logger.info(`Found ${pathDetails.length} paths`);

      return result;
    } catch (error) {
      const errorMsg = `All paths analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg);
      return result;
    }
  }

  /**
   * Find privilege escalation opportunities for a principal
   */
  async findPrivilegeEscalationOpportunities(principalObjectId: string): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      success: false,
      analysisType: 'privilege_escalation',
      results: null,
      errors: [],
      warnings: []
    };

    try {
      logger.info(`Finding privilege escalation opportunities for ${principalObjectId}`);

      const principal = nodes.get(principalObjectId);

      if (!principal) {
        throw new Error(`Principal ${principalObjectId} not found`);
      }

      const opportunities: PrivilegeEscalationOpportunity[] = [];

      // Get all edges from this principal
      const principalEdges = edges.get(principalObjectId) || [];

      for (const edge of principalEdges) {
        const target = nodes.get(edge.targetId);

        if (!target) continue;

        // Check for high-privilege targets
        const isHighPrivilege = this.isHighPrivilegeTarget(target);

        if (isHighPrivilege) {
          const technique = this.mapEdgeTypeToTechnique(edge.edgeType);
          const opportunity: PrivilegeEscalationOpportunity = {
            principal: principal.name,
            principalType: principal.type,
            target: target.name,
            targetType: target.type,
            technique,
            riskScore: this.calculateRiskScore([edge]),
            description: this.generateEscalationDescription(edge.edgeType, principal.name, target.name),
            prerequisites: this.getPrerequisites(edge.edgeType)
          };

          opportunities.push(opportunity);
        }
      }

      result.results = {
        principal: principal.name,
        principalType: principal.type,
        opportunities,
        totalOpportunities: opportunities.length
      };
      result.success = true;

      logger.info(`Found ${opportunities.length} privilege escalation opportunities`);

      return result;
    } catch (error) {
      const errorMsg = `Privilege escalation analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg);
      return result;
    }
  }

  /**
   * Analyze a domain for security insights
   */
  async analyzeDomain(domainName: string): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      success: false,
      analysisType: 'domain_analysis',
      results: null,
      errors: [],
      warnings: []
    };

    try {
      logger.info(`Analyzing domain: ${domainName}`);

      const domainNodes = Array.from(nodes.values()).filter(n => n.domain === domainName);

      if (domainNodes.length === 0) {
        throw new Error(`No nodes found for domain ${domainName}`);
      }

      const domainNodeIds = domainNodes.map(n => n.objectId);
      const domainEdges: PathEdge[] = [];

      for (const [sourceId, edgeList] of edges.entries()) {
        if (domainNodeIds.includes(sourceId)) {
          domainEdges.push(...edgeList.filter(e => domainNodeIds.includes(e.targetId)));
        }
      }

      // Identify high-value targets
      const highValueTargets = domainNodes.filter(n => this.isHighPrivilegeTarget(n)).map(n => n.name);

      // Identify administrators
      const administrators = domainNodes.filter(n => 
        n.labels && n.labels.includes('Admin')
      ).map(n => n.name);

      // Identify domain controllers
      const domainControllers = domainNodes.filter(n => 
        n.type === 'Domain Controller' || 
        (n.labels && n.labels.includes('Domain Controller'))
      ).map(n => n.name);

      // Find critical paths to domain admins
      const criticalPaths: AttackPath[] = [];
      const domainAdmins = domainNodes.filter(n => 
        n.labels && n.labels.includes('Domain Admin')
      );

      for (const da of domainAdmins) {
        // Find paths from regular users to this DA
        const regularUsers = domainNodes.filter(n => 
          n.type === 'User' && 
          !(n.labels && n.labels.includes('Admin'))
        );

        for (const user of regularUsers.slice(0, 5)) { // Limit to 5 users for performance
          const pathResult = await this.findShortestPath(user.objectId, da.objectId, 5);
          if (pathResult.success && pathResult.results.shortestPath) {
            criticalPaths.push(pathResult.results.shortestPath);
          }
        }
      }

      result.results = {
        domainName,
        totalNodes: domainNodes.length,
        totalEdges: domainEdges.length,
        highValueTargets,
        administrators,
        domainControllers,
        criticalPaths
      };
      result.success = true;

      logger.info(`Domain analysis completed for ${domainName}`);

      return result;
    } catch (error) {
      const errorMsg = `Domain analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg);
      return result;
    }
  }

  /**
   * Calculate risk score for a set of edges
   */
  private calculateRiskScore(edgeList: PathEdge[]): number {
    let risk = 0;
    for (const edge of edgeList) {
      // Higher risk for certain edge types
      const edgeTypeRisk: Record<string, number> = {
        'MemberOf': 10,
        'HasSession': 20,
        'AdminTo': 30,
        'AllExtendedRights': 25,
        'ForceChangePassword': 35,
        'GenericAll': 40,
        'WriteDACL': 35,
        'WriteOwner': 40
      };
      risk += edgeTypeRisk[edge.edgeType] || 15;
    }
    return Math.min(100, risk);
  }

  /**
   * Estimate execution time for a path
   */
  private estimateExecutionTime(edgeList: PathEdge[]): number {
    // Base time per edge (in seconds)
    const baseTimePerEdge = 30;
    return edgeList.length * baseTimePerEdge;
  }

  /**
   * Check if a target is high-privilege
   */
  private isHighPrivilegeTarget(node: PathNode): boolean {
    const highPrivilegeTypes = ['Domain Admin', 'Enterprise Admin', 'Administrator', 'Domain Controller'];
    const highPrivilegeLabels = ['Admin', 'Domain Admin', 'Enterprise Admin'];

    return highPrivilegeTypes.includes(node.type) ||
           (node.labels && node.labels.some((l: string) => highPrivilegeLabels.includes(l)));
  }

  /**
   * Map edge type to technique name
   */
  private mapEdgeTypeToTechnique(edgeType: string): string {
    const techniqueMap: Record<string, string> = {
      'MemberOf': 'Group Membership Abuse',
      'HasSession': 'Session Hijacking',
      'AdminTo': 'Local Admin Privilege Abuse',
      'AllExtendedRights': 'Extended Rights Abuse',
      'ForceChangePassword': 'Password Reset',
      'GenericAll': 'GenericAll Abuse',
      'WriteDACL': 'DACL Modification',
      'WriteOwner': 'Owner Takeover'
    };
    return techniqueMap[edgeType] || 'Unknown Technique';
  }

  /**
   * Generate escalation description
   */
  private generateEscalationDescription(edgeType: string, principal: string, target: string): string {
    const descriptions: Record<string, string> = {
      'MemberOf': `${principal} is a member of ${target}, providing inherited privileges`,
      'HasSession': `${principal} has an active session on ${target}, allowing lateral movement`,
      'AdminTo': `${principal} has administrative rights on ${target}`,
      'AllExtendedRights': `${principal} has extended rights on ${target}, allowing control`,
      'ForceChangePassword': `${principal} can force password change for ${target}`,
      'GenericAll': `${principal} has full control over ${target}`,
      'WriteDACL': `${principal} can modify ACLs on ${target}`,
      'WriteOwner': `${principal} can take ownership of ${target}`
    };
    return descriptions[edgeType] || `${principal} has ${edgeType} access to ${target}`;
  }

  /**
   * Get prerequisites for a technique
   */
  private getPrerequisites(edgeType: string): string[] {
    const prerequisites: Record<string, string[]> = {
      'MemberOf': ['Valid group membership', 'Group privileges'],
      'HasSession': ['Active session', 'Network connectivity'],
      'AdminTo': ['Administrative credentials', 'Network access'],
      'AllExtendedRights': ['Extended rights assignment', 'Valid authentication'],
      'ForceChangePassword': ['Password reset permission', 'Valid authentication'],
      'GenericAll': ['Full control permissions', 'Valid authentication'],
      'WriteDACL': ['DACL write permission', 'Valid authentication'],
      'WriteOwner': ['Owner write permission', 'Valid authentication']
    };
    return prerequisites[edgeType] || ['Valid authentication'];
  }
}

// Singleton instance
export const bloodHoundAnalyzer = new BloodHoundAnalyzer();