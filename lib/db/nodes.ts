import { randomUUID } from "node:crypto"
import { Collections, Node, NodeCreate, NodeUpdate } from "@/lib/db/schema"

// In-memory database simulation for demonstration
// In production, this would be replaced with actual database connections
class NodeDatabase {
  private nodes: Map<string, Node> = new Map()

  constructor() {
    this.initializeDefaultNodes()
  }

  private initializeDefaultNodes() {
    const defaultNodes: Node[] = [
      {
        id: "node-001",
        name: "US-East-Primary",
        hostname: "us-east.example.com",
        region: "us-east",
        listenAddr: ":443",
        status: "running",
        tags: ["primary", "production"],
        provider: "aws",
        lastHeartbeatAt: Date.now() - 30000,
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 30000,
      },
      {
        id: "node-002", 
        name: "EU-West-Backup",
        hostname: "eu-west.example.com",
        region: "eu-west",
        listenAddr: ":443",
        status: "stopped",
        tags: ["backup", "eu"],
        provider: "gcp",
        lastHeartbeatAt: Date.now() - 300000,
        createdAt: Date.now() - 172800000,
        updatedAt: Date.now() - 300000,
      },
      {
        id: "node-003",
        name: "Asia-Pacific-Edge",
        hostname: "ap-south.example.com", 
        region: "ap-south",
        listenAddr: ":443",
        status: "running",
        tags: ["edge", "asia"],
        provider: "azure",
        lastHeartbeatAt: Date.now() - 15000,
        createdAt: Date.now() - 259200000,
        updatedAt: Date.now() - 15000,
      }
    ]

    defaultNodes.forEach(node => this.nodes.set(node.id, node))
  }

  async findAll(): Promise<Node[]> {
    return Array.from(this.nodes.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async findById(id: string): Promise<Node | null> {
    return this.nodes.get(id) || null
  }

  async create(data: NodeCreate): Promise<Node> {
    const id = randomUUID()
    const now = Date.now()
    const node: Node = {
      id,
      name: data.name,
      hostname: data.hostname,
      region: data.region,
      listenAddr: data.listenAddr ?? ":443",
      status: "stopped",
      tags: data.tags ?? [],
      provider: data.provider,
      lastHeartbeatAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.nodes.set(id, node)
    return node
  }

  async update(id: string, data: NodeUpdate): Promise<Node | null> {
    const existing = this.nodes.get(id)
    if (!existing) return null

    const updated: Node = {
      ...existing,
      ...data,
      updatedAt: Date.now(),
    }
    this.nodes.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.nodes.delete(id)
  }

  async updateHeartbeat(id: string): Promise<void> {
    const node = this.nodes.get(id)
    if (node) {
      node.lastHeartbeatAt = Date.now()
      node.updatedAt = Date.now()
    }
  }
}

// Global database instance
const nodeDb = new NodeDatabase()

function now(): number {
  return Date.now()
}

export async function listNodes(): Promise<Node[]> {
  return await nodeDb.findAll()
}

export async function getNodeById(id: string): Promise<Node | null> {
  return await nodeDb.findById(id)
}

export async function createNode(input: NodeCreate): Promise<Node> {
  return await nodeDb.create(input)
}

export async function updateNode(id: string, patch: NodeUpdate): Promise<Node | null> {
  return await nodeDb.update(id, patch)
}

export async function deleteNode(id: string): Promise<boolean> {
  return await nodeDb.delete(id)
}

// Additional helper functions for real-time updates
export async function updateNodeHeartbeat(id: string): Promise<void> {
  await nodeDb.updateHeartbeat(id)
}

export async function getNodeStats() {
  const nodes = await listNodes()
  return {
    total: nodes.length,
    running: nodes.filter(n => n.status === 'running').length,
    stopped: nodes.filter(n => n.status === 'stopped').length,
    errored: nodes.filter(n => n.status === 'errored').length,
  }
}
