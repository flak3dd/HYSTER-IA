import { PrismaClient } from '@prisma/client';
import type { LateralMovementRequest, LateralMovementResult, Credential } from '../types';

const prisma = new PrismaClient();

export class PassTheHashExecution {
  private jitterMin: number = 1500;
  private jitterMax: number = 6000;

  async execute(request: LateralMovementRequest): Promise<LateralMovementResult> {
    const startTime = Date.now();

    try {
      // Validate request
      if (!request.credentialId) {
        throw new Error('Credential ID is required for Pass-the-Hash execution');
      }

      // Get source and target host information
      const sourceHost = await prisma.compromisedHost.findUnique({
        where: { id: request.sourceHostId }
      });

      const targetHost = await prisma.compromisedHost.findUnique({
        where: { id: request.targetHostId }
      });

      if (!sourceHost || !targetHost) {
        throw new Error('Source or target host not found');
      }

      // Get credential
      const credential = await this.getCredential(request.credentialId);
      if (!credential || !credential.hash) {
        throw new Error('Credential with hash is required for Pass-the-Hash');
      }

      // Apply jitter for OPSEC (higher jitter for dangerous techniques)
      await this.applyJitter();

      // Execute Pass-the-Hash movement
      const result = await this.executePTHMovement(
        sourceHost,
        targetHost,
        credential,
        request.proxyConfig,
        request.options
      );

      const executionTime = Date.now() - startTime;

      // Log pivot path
      await this.logPivotPath({
        fromHostId: request.sourceHostId,
        toHostId: request.targetHostId,
        technique: 'pth',
        success: result.success,
        executionTime
      });

      return {
        success: result.success,
        technique: 'pth',
        sourceHostId: request.sourceHostId,
        targetHostId: request.targetHostId,
        error: result.error,
        executionTime,
        pivotPathId: result.pivotPathId
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        technique: 'pth',
        sourceHostId: request.sourceHostId,
        targetHostId: request.targetHostId,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime
      };
    }
  }

  private async getCredential(credentialId: string): Promise<Credential | null> {
    // This would integrate with credential-vault
    return {
      id: credentialId,
      type: 'NTLM',
      username: 'Administrator',
      hash: 'aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0',
      createdAt: new Date()
    };
  }

  private async executePTHMovement(
    sourceHost: any,
    targetHost: any,
    credential: Credential,
    proxyConfig?: { socksProxyUrl?: string; httpProxyUrl?: string },
    options?: Record<string, any>
  ): Promise<{ success: boolean; error?: string; pivotPathId?: string }> {
    try {
      if (!sourceHost.implantId) {
        throw new Error('Source host has no implant for Pass-the-Hash execution');
      }

      // Parse NTLM hash (format: LM:NTLM)
      const hashParts = credential.hash.split(':');
      if (hashParts.length !== 2) {
        throw new Error('Invalid NTLM hash format. Expected LM:NTLM');
      }

      const lmHash = hashParts[0];
      const ntlmHash = hashParts[1];

      // Create implant task for Pass-the-Hash execution
      const implantTask = await prisma.implantTask.create({
        data: {
          implantId: sourceHost.implantId,
          taskId: `pth-${Date.now()}`,
          type: 'pass_the_hash',
          args: {
            target: targetHost.ipAddress,
            username: credential.username,
            lmHash,
            ntlmHash,
            domain: credential.domain,
            proxyConfig,
            options
          },
          status: 'pending'
        }
      });

      // Simulate Pass-the-Hash execution
      await this.simulateImplantExecution(implantTask.id);

      // Pass-the-Hash has high success rate when hash is valid
      if (Math.random() > 0.1) { // 90% success rate
        await this.markHostCompromised(targetHost.id, sourceHost.implantId);

        const pivotPath = await prisma.pivotPath.create({
          data: {
            fromHostId: sourceHost.id,
            toHostId: targetHost.id,
            technique: 'pth',
            success: true
          }
        });

        return { success: true, pivotPathId: pivotPath.id };
      } else {
        return { success: false, error: 'Pass-the-Hash failed - invalid hash or target protections' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async simulateImplantExecution(taskId: string): Promise<void> {
    // Pass-the-Hash is typically fast
    await new Promise(resolve => setTimeout(resolve, 1000));

    await prisma.implantTask.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        result: { success: true, output: 'PTH_EXEC_COMPLETE' }
      }
    });
  }

  private async markHostCompromised(hostId: string, implantId: string): Promise<void> {
    await prisma.compromisedHost.update({
      where: { id: hostId },
      data: {
        implantId,
        lastSeen: new Date()
      }
    });
  }

  private async logPivotPath(data: {
    fromHostId: string;
    toHostId: string;
    technique: string;
    success: boolean;
    executionTime: number;
  }): Promise<void> {
    await prisma.pivotPath.create({
      data: {
        fromHostId: data.fromHostId,
        toHostId: data.toHostId,
        technique: data.technique as any,
        success: data.success
      }
    });
  }

  private async applyJitter(): Promise<void> {
    const jitter = Math.floor(Math.random() * (this.jitterMax - this.jitterMin + 1)) + this.jitterMin;
    await new Promise(resolve => setTimeout(resolve, jitter));
  }

  validateHash(hash: string): boolean {
    // Validate NTLM hash format (32 hex chars for LM, 32 hex chars for NTLM)
    const parts = hash.split(':');
    if (parts.length !== 2) return false;

    const lmHashRegex = /^[a-fA-F0-9]{32}$/;
    const ntlmHashRegex = /^[a-fA-F0-9]{32}$/;

    return lmHashRegex.test(parts[0]) && ntlmHashRegex.test(parts[1]);
  }

  setJitter(min: number, max: number): void {
    this.jitterMin = min;
    this.jitterMax = max;
  }
}

// Singleton instance
export const passTheHashExecution = new PassTheHashExecution();