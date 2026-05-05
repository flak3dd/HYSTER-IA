import logger from '../../logger';
import { bloodHoundStorage } from './storage';

export interface BloodHoundImportResult {
  success: boolean;
  nodesImported: number;
  edgesImported: number;
  errors: string[];
  warnings: string[];
}

export interface SharpHoundNode {
  ObjectId: string;
  Name: string;
  Type: string;
  Properties?: Record<string, any>;
  Labels?: string[];
  Domain?: string;
}

export interface SharpHoundEdge {
  SourceId: string;
  TargetId: string;
  EdgeType: string;
  ACRights?: string[];
}

export interface SharpHoundData {
  nodes?: SharpHoundNode[];
  edges?: SharpHoundEdge[];
  meta?: {
    type: string;
    version: string;
    count: number;
  };
}

export class BloodHoundImporter {
  /**
   * Import SharpHound JSON data into storage
   */
  async importSharpHoundData(data: SharpHoundData): Promise<BloodHoundImportResult> {
    const result: BloodHoundImportResult = {
      success: false,
      nodesImported: 0,
      edgesImported: 0,
      errors: [],
      warnings: []
    };

    try {
      logger.info('Starting BloodHound data import');

      // Validate data structure
      if (!data.nodes || !data.edges) {
        throw new Error('Invalid SharpHound data: missing nodes or edges');
      }

      logger.info(`Importing ${data.nodes.length} nodes and ${data.edges.length} edges`);

      // Clear existing data
      bloodHoundStorage.clear();

      // Import nodes
      for (const node of data.nodes) {
        try {
          this.importNode(node);
          result.nodesImported++;
        } catch (error) {
          const errorMsg = `Failed to import node ${node.ObjectId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      // Import edges
      for (const edge of data.edges) {
        try {
          this.importEdge(edge);
          result.edgesImported++;
        } catch (error) {
          const errorMsg = `Failed to import edge ${edge.SourceId} -> ${edge.TargetId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      result.success = result.errors.length === 0;
      logger.info(`BloodHound import completed: ${result.nodesImported} nodes, ${result.edgesImported} edges`);

      return result;
    } catch (error) {
      const errorMsg = `BloodHound import failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg);
      return result;
    }
  }

  /**
   * Import a single BloodHound node
   */
  private importNode(node: SharpHoundNode): void {
    bloodHoundStorage.setNode(node);
  }

  /**
   * Import a single BloodHound edge
   */
  private importEdge(edge: SharpHoundEdge): void {
    // Verify source and target nodes exist
    const sourceNode = bloodHoundStorage.getNode(edge.SourceId);
    const targetNode = bloodHoundStorage.getNode(edge.TargetId);

    if (!sourceNode) {
      throw new Error(`Source node ${edge.SourceId} not found`);
    }

    if (!targetNode) {
      throw new Error(`Target node ${edge.TargetId} not found`);
    }

    bloodHoundStorage.setEdge(edge);
  }

  /**
   * Import BloodHound data from a JSON file
   */
  async importFromFile(filePath: string): Promise<BloodHoundImportResult> {
    try {
      const fs = await import('node:fs/promises');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data: SharpHoundData = JSON.parse(fileContent);

      return await this.importSharpHoundData(data);
    } catch (error) {
      logger.error(`Failed to import BloodHound data from file:`, error);
      return {
        success: false,
        nodesImported: 0,
        edgesImported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      };
    }
  }

  /**
   * Import BloodHound data from a JSON string
   */
  async importFromString(jsonString: string): Promise<BloodHoundImportResult> {
    try {
      const data: SharpHoundData = JSON.parse(jsonString);
      return await this.importSharpHoundData(data);
    } catch (error) {
      logger.error(`Failed to import BloodHound data from string:`, error);
      return {
        success: false,
        nodesImported: 0,
        edgesImported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      };
    }
  }

  /**
   * Validate BloodHound data structure
   */
  validateSharpHoundData(data: SharpHoundData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.nodes) {
      errors.push('Missing nodes array');
    } else if (!Array.isArray(data.nodes)) {
      errors.push('Nodes must be an array');
    }

    if (!data.edges) {
      errors.push('Missing edges array');
    } else if (!Array.isArray(data.edges)) {
      errors.push('Edges must be an array');
    }

    // Validate node structure
    if (data.nodes) {
      for (let i = 0; i < data.nodes.length; i++) {
        const node = data.nodes[i];
        if (!node.ObjectId) {
          errors.push(`Node at index ${i} missing ObjectId`);
        }
        if (!node.Name) {
          errors.push(`Node at index ${i} missing Name`);
        }
        if (!node.Type) {
          errors.push(`Node at index ${i} missing Type`);
        }
      }
    }

    // Validate edge structure
    if (data.edges) {
      for (let i = 0; i < data.edges.length; i++) {
        const edge = data.edges[i];
        if (!edge.SourceId) {
          errors.push(`Edge at index ${i} missing SourceId`);
        }
        if (!edge.TargetId) {
          errors.push(`Edge at index ${i} missing TargetId`);
        }
        if (!edge.EdgeType) {
          errors.push(`Edge at index ${i} missing EdgeType`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get import statistics
   */
  async getImportStats(): Promise<{
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
    domains: string[];
  }> {
    const nodes = bloodHoundStorage.getAllNodes();
    const edges = bloodHoundStorage.getAllEdges();

    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};
    const domains = new Set<string>();

    for (const node of nodes) {
      nodesByType[node.Type] = (nodesByType[node.Type] || 0) + 1;
      if (node.Domain) {
        domains.add(node.Domain);
      }
    }

    for (const edge of edges) {
      edgesByType[edge.EdgeType] = (edgesByType[edge.EdgeType] || 0) + 1;
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType,
      edgesByType,
      domains: Array.from(domains)
    };
  }

  /**
   * Clear all BloodHound data
   */
  async clearAllData(): Promise<{ nodesDeleted: number; edgesDeleted: number }> {
    const nodeCount = bloodHoundStorage.getNodeCount();
    const edgeCount = bloodHoundStorage.getEdgeCount();

    bloodHoundStorage.clear();

    logger.info(`Cleared BloodHound data: ${nodeCount} nodes, ${edgeCount} edges`);

    return {
      nodesDeleted: nodeCount,
      edgesDeleted: edgeCount
    };
  }
}

// Singleton instance
export const bloodHoundImporter = new BloodHoundImporter();