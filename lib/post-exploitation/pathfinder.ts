import { PrismaClient } from '@prisma/client';
import type {
  AttackPath,
  AttackPathNode,
  AttackPathEdge,
  CompromisedHost,
  Credential,
  MovementTechnique,
  PathfinderConfig,
  PrivilegeLevel
} from './types';
import { credentialVault } from './credential-vault';

const prisma = new PrismaClient();

export class Pathfinder {
  private config: PathfinderConfig = {
    maxDepth: 5,
    maxPaths: 10,
    minConfidence: 0.3,
    preferFileless: true,
    avoidDangerous: true
  };

  private techniqueConfigs: Record<MovementTechnique, {
    opsecScore: number;
    dangerous: boolean;
    fileless: boolean;
    baseConfidence: number;
    estimatedTime: number;
  }> = {
    smb: { opsecScore: 70, dangerous: false, fileless: true, baseConfidence: 0.8, estimatedTime: 30 },
    winrm: { opsecScore: 75, dangerous: false, fileless: true, baseConfidence: 0.85, estimatedTime: 25 },
    wmi: { opsecScore: 80, dangerous: false, fileless: true, baseConfidence: 0.75, estimatedTime: 35 },
    pth: { opsecScore: 60, dangerous: true, fileless: true, baseConfidence: 0.9, estimatedTime: 15 },
    kerberoast: { opsecScore: 50, dangerous: true, fileless: true, baseConfidence: 0.7, estimatedTime: 60 },
    rdp: { opsecScore: 40, dangerous: false, fileless: false, baseConfidence: 0.6, estimatedTime: 45 },
    psexec: { opsecScore: 55, dangerous: false, fileless: false, baseConfidence: 0.65, estimatedTime: 40 }
  };

  setConfig(config: Partial<PathfinderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async discoverAttackPaths(
    startHostId: string,
    targetPrivilege: PrivilegeLevel = 'domain_admin'
  ): Promise<AttackPath[]> {
    const compromisedHosts = await this.getCompromisedHosts();
    const hostMap = new Map<string, CompromisedHost>();
    compromisedHosts.forEach(host => hostMap.set(host.id, host));

    const startHost = hostMap.get(startHostId);
    if (!startHost) {
      throw new Error(`Start host ${startHostId} not found`);
    }

    const allCredentials = await this.getAllCredentials();
    const credentialMap = new Map<string, Credential[]>();
    allCredentials.forEach(cred => {
      if (cred.sourceHostId) {
        const creds = credentialMap.get(cred.sourceHostId) || [];
        creds.push(cred);
        credentialMap.set(cred.sourceHostId, creds);
      }
    });

    const paths: AttackPath[] = [];
    const visited = new Set<string>();
    const queue: Array<{
      currentHostId: string;
      path: AttackPathNode[];
      edges: AttackPathEdge[];
      depth: number;
    }> = [];

    queue.push({
      currentHostId: startHostId,
      path: [this.hostToNode(startHost, credentialMap.get(startHostId) || [])],
      edges: [],
      depth: 0
    });

    visited.add(startHostId);

    while (queue.length > 0 && paths.length < this.config.maxPaths) {
      const { currentHostId, path, edges, depth } = queue.shift()!;

      if (depth >= this.config.maxDepth) {
        continue;
      }

      const currentHost = hostMap.get(currentHostId);
      if (!currentHost) continue;

      // Check if we've reached target privilege
      if (this.hasPrivilege(currentHost.privileges, targetPrivilege)) {
        paths.push({
          nodes: path,
          edges,
          totalRisk: this.calculateRisk(edges),
          estimatedTime: this.calculateTotalTime(edges),
          pathToPrivilege: path.map(n => n.hostId)
        });
        continue;
      }

      // Find next reachable hosts
      const nextHosts = await this.findReachableHosts(
        currentHostId,
        credentialMap.get(currentHostId) || [],
        hostMap,
        visited
      );

      for (const nextHost of nextHosts) {
        if (visited.has(nextHost.hostId)) continue;

        visited.add(nextHost.hostId);

        const newEdges = [...edges, nextHost.edge];
        const newNodes = [
          ...path,
          this.hostToNode(hostMap.get(nextHost.hostId)!, credentialMap.get(nextHost.hostId) || [])
        ];

        queue.push({
          currentHostId: nextHost.hostId,
          path: newNodes,
          edges: newEdges,
          depth: depth + 1
        });
      }
    }

    // Sort paths by risk (lower is better) and confidence
    return paths
      .sort((a, b) => a.totalRisk - b.totalRisk)
      .slice(0, this.config.maxPaths);
  }

  async findReachableHosts(
    sourceHostId: string,
    credentials: Credential[],
    hostMap: Map<string, CompromisedHost>,
    visited: Set<string>
  ): Promise<Array<{ hostId: string; edge: AttackPathEdge }>> {
    const reachable: Array<{ hostId: string; edge: AttackPathEdge }> = [];

    for (const [hostId, host] of hostMap.entries()) {
      if (visited.has(hostId) || hostId === sourceHostId) continue;

      for (const cred of credentials) {
        // Check if credential can be used to reach this host
        if (this.canReachHost(cred, host)) {
          const techniques = this.getAvailableTechniques(cred, host);

          for (const technique of techniques) {
            const config = this.techniqueConfigs[technique];

            if (this.config.avoidDangerous && config.dangerous) continue;
            if (this.config.preferFileless && !config.fileless) continue;

            const confidence = this.calculateConfidence(cred, host, technique);
            if (confidence < this.config.minConfidence) continue;

            reachable.push({
              hostId,
              edge: {
                fromHostId: sourceHostId,
                toHostId: hostId,
                technique,
                confidence,
                estimatedTime: config.estimatedTime
              }
            });
          }
        }
      }
    }

    return reachable;
  }

  canReachHost(credential: Credential, host: CompromisedHost): boolean {
    // Check if credential domain matches host domain
    if (credential.domain && host.domain && credential.domain !== host.domain) {
      return false;
    }

    // Check if credential type is applicable
    if (credential.type === 'Kerberos' && !host.domain) {
      return false;
    }

    return true;
  }

  getAvailableTechniques(credential: Credential, host: CompromisedHost): MovementTechnique[] {
    const techniques: MovementTechnique[] = [];

    if (credential.hash) {
      techniques.push('pth');
    }

    if (credential.password) {
      techniques.push('smb', 'winrm', 'wmi', 'rdp', 'psexec');
    }

    if (credential.type === 'Kerberos' && host.domain) {
      techniques.push('kerberoast');
    }

    return techniques;
  }

  calculateConfidence(credential: Credential, host: CompromisedHost, technique: MovementTechnique): number {
    const baseConfidence = this.techniqueConfigs[technique].baseConfidence;
    let confidence = baseConfidence;

    // Boost confidence if we have plaintext password
    if (credential.password) {
      confidence += 0.1;
    }

    // Boost confidence if host has lower privileges (easier to compromise)
    if (host.privileges === 'user') {
      confidence += 0.05;
    }

    // Reduce confidence if credential is old
    const credentialAge = Date.now() - credential.createdAt.getTime();
    const daysOld = credentialAge / (1000 * 60 * 60 * 24);
    if (daysOld > 30) {
      confidence -= 0.1;
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  calculateRisk(edges: AttackPathEdge[]): number {
    if (edges.length === 0) return 0;

    let totalRisk = 0;
    for (const edge of edges) {
      const techniqueConfig = this.techniqueConfigs[edge.technique];
      const techniqueRisk = 1 - (edge.confidence * (techniqueConfig.opsecScore / 100));
      totalRisk += techniqueRisk;
    }

    return totalRisk / edges.length;
  }

  calculateTotalTime(edges: AttackPathEdge[]): number {
    return edges.reduce((sum, edge) => sum + edge.estimatedTime, 0);
  }

  hasPrivilege(current: PrivilegeLevel, target: PrivilegeLevel): boolean {
    const privilegeHierarchy: Record<PrivilegeLevel, number> = {
      user: 1,
      admin: 2,
      system: 3,
      domain_admin: 4
    };

    return privilegeHierarchy[current] >= privilegeHierarchy[target];
  }

  hostToNode(host: CompromisedHost, credentials: Credential[]): AttackPathNode {
    return {
      hostId: host.id,
      hostname: host.hostname,
      ipAddress: host.ipAddress,
      privileges: host.privileges,
      credentials
    };
  }

  private async getCompromisedHosts(): Promise<CompromisedHost[]> {
    const hosts = await prisma.compromisedHost.findMany({
      include: {
        credentials: true
      }
    });

    return hosts.map(host => ({
      id: host.id,
      hostname: host.hostname,
      ipAddress: host.ipAddress,
      os: host.os ?? undefined,
      domain: host.domain ?? undefined,
      privileges: host.privileges as PrivilegeLevel,
      implantId: host.implantId ?? undefined,
      firstCompromised: host.firstCompromised,
      lastSeen: host.lastSeen,
      credentials: host.credentials.map(cred => ({
        id: cred.id,
        type: cred.type as any,
        username: cred.username,
        password: cred.password ?? undefined,
        hash: cred.hash ?? undefined,
        domain: cred.domain ?? undefined,
        sourceHostId: cred.sourceHostId ?? undefined,
        createdAt: cred.createdAt
      }))
    }));
  }

  private async getAllCredentials(): Promise<Credential[]> {
    return credentialVault.searchCredentials({});
  }

  async getRecommendedPath(
    startHostId: string,
    targetPrivilege: PrivilegeLevel = 'domain_admin'
  ): Promise<AttackPath | null> {
    const paths = await this.discoverAttackPaths(startHostId, targetPrivilege);

    if (paths.length === 0) {
      return null;
    }

    // Return the path with the lowest risk and highest confidence
    return paths.reduce((best, current) => {
      const currentScore = current.totalRisk - (current.edges.reduce((sum, e) => sum + e.confidence, 0) / current.edges.length);
      const bestScore = best.totalRisk - (best.edges.reduce((sum, e) => sum + e.confidence, 0) / best.edges.length);
      return currentScore < bestScore ? current : best;
    });
  }

  async visualizeGraph(): Promise<{
    nodes: Array<{ id: string; label: string; group: string }>;
    edges: Array<{ from: string; to: string; label: string; confidence: number }>;
  }> {
    const hosts = await this.getCompromisedHosts();
    const pivotPaths = await prisma.pivotPath.findMany();

    const nodes = hosts.map(host => ({
      id: host.id,
      label: host.hostname,
      group: host.privileges
    }));

    const edges = pivotPaths.map(path => ({
      from: path.fromHostId,
      to: path.toHostId,
      label: path.technique,
      confidence: path.success ? 1 : 0
    }));

    return { nodes, edges };
  }
}

// Singleton instance
export const pathfinder = new Pathfinder();