// Shared in-memory storage for BloodHound data

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

class BloodHoundStorage {
  private nodes = new Map<string, SharpHoundNode>();
  private edges = new Map<string, SharpHoundEdge[]>();

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  setNode(node: SharpHoundNode): void {
    this.nodes.set(node.ObjectId, node);
  }

  getNode(objectId: string): SharpHoundNode | undefined {
    return this.nodes.get(objectId);
  }

  getAllNodes(): SharpHoundNode[] {
    return Array.from(this.nodes.values());
  }

  setEdge(edge: SharpHoundEdge): void {
    if (!this.edges.has(edge.SourceId)) {
      this.edges.set(edge.SourceId, []);
    }
    this.edges.get(edge.SourceId)!.push(edge);
  }

  getEdges(sourceId: string): SharpHoundEdge[] {
    return this.edges.get(sourceId) || [];
  }

  getAllEdges(): SharpHoundEdge[] {
    const allEdges: SharpHoundEdge[] = [];
    for (const edgeList of this.edges.values()) {
      allEdges.push(...edgeList);
    }
    return allEdges;
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.getAllEdges().length;
  }
}

// Singleton instance
export const bloodHoundStorage = new BloodHoundStorage();