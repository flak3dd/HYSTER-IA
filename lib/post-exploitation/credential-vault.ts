import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes, scrypt, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { serverEnv } from '@/lib/env';
import type { Credential, CredentialType, CredentialHarvestRequest, CredentialHarvestResult } from './types';

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

interface EncryptionConfig {
  key: Buffer;
  algorithm: string;
}

export class CredentialVault {
  private encryptionConfig: EncryptionConfig | null = null;
  private encryptionKey: string;

  constructor() {
    const env = serverEnv();
    this.encryptionKey = env.CREDENTIAL_VAULT_KEY || 'default-change-me-in-production';
  }

  async initialize(): Promise<void> {
    if (!this.encryptionConfig) {
      const key = await this.deriveKey(this.encryptionKey);
      this.encryptionConfig = {
        key,
        algorithm: 'aes-256-gcm'
      };
    }
  }

  private async deriveKey(password: string): Promise<Buffer> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 32) as Buffer;
    return key;
  }

  private encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
    if (!this.encryptionConfig) {
      throw new Error('CredentialVault not initialized');
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv(this.encryptionConfig.algorithm, this.encryptionConfig.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  private decrypt(encrypted: string, iv: string, authTag: string): string {
    if (!this.encryptionConfig) {
      throw new Error('CredentialVault not initialized');
    }

    const decipher = createDecipheriv(
      this.encryptionConfig.algorithm,
      this.encryptionConfig.key,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async storeCredential(credential: Omit<Credential, 'id' | 'createdAt'>): Promise<Credential> {
    await this.initialize();

    let encryptedPassword: string | undefined;
    let passwordIv: string | undefined;
    let passwordAuthTag: string | undefined;

    if (credential.password) {
      const encrypted = this.encrypt(credential.password);
      encryptedPassword = encrypted.encrypted;
      passwordIv = encrypted.iv;
      passwordAuthTag = encrypted.authTag;
    }

    const stored = await prisma.credential.create({
      data: {
        type: credential.type,
        username: credential.username,
        password: encryptedPassword,
        hash: credential.hash,
        domain: credential.domain,
        sourceHostId: credential.sourceHostId,
        // Store IV and authTag in metadata for decryption
        metadata: {
          passwordIv,
          passwordAuthTag
        } as any
      }
    });

    return {
      id: stored.id,
      type: stored.type as CredentialType,
      username: stored.username,
      password: credential.password, // Return original for immediate use
      hash: stored.hash ?? undefined,
      domain: stored.domain ?? undefined,
      sourceHostId: stored.sourceHostId ?? undefined,
      createdAt: stored.createdAt
    };
  }

  async getCredential(id: string): Promise<Credential | null> {
    const stored = await prisma.credential.findUnique({
      where: { id },
      include: { sourceHost: true }
    });

    if (!stored) {
      return null;
    }

    let decryptedPassword: string | undefined;
    if (stored.password) {
      const metadata = stored.metadata as any;
      if (metadata?.passwordIv && metadata?.passwordAuthTag) {
        try {
          decryptedPassword = this.decrypt(
            stored.password,
            metadata.passwordIv,
            metadata.passwordAuthTag
          );
        } catch (error) {
          console.error('Failed to decrypt credential:', error);
        }
      }
    }

    return {
      id: stored.id,
      type: stored.type as CredentialType,
      username: stored.username,
      password: decryptedPassword,
      hash: stored.hash ?? undefined,
      domain: stored.domain ?? undefined,
      sourceHostId: stored.sourceHostId ?? undefined,
      createdAt: stored.createdAt
    };
  }

  async getCredentialsByHost(hostId: string): Promise<Credential[]> {
    const credentials = await prisma.credential.findMany({
      where: { sourceHostId: hostId },
      include: { sourceHost: true }
    });

    return Promise.all(
      credentials.map(async (cred) => {
        let decryptedPassword: string | undefined;
        if (cred.password) {
          const metadata = cred.metadata as any;
          if (metadata?.passwordIv && metadata?.passwordAuthTag) {
            try {
              decryptedPassword = this.decrypt(
                cred.password,
                metadata.passwordIv,
                metadata.passwordAuthTag
              );
            } catch (error) {
              console.error('Failed to decrypt credential:', error);
            }
          }
        }

        return {
          id: cred.id,
          type: cred.type as CredentialType,
          username: cred.username,
          password: decryptedPassword,
          hash: cred.hash ?? undefined,
          domain: cred.domain ?? undefined,
          sourceHostId: cred.sourceHostId ?? undefined,
          createdAt: cred.createdAt
        };
      })
    );
  }

  async getCredentialsByDomain(domain: string): Promise<Credential[]> {
    const credentials = await prisma.credential.findMany({
      where: { domain },
      include: { sourceHost: true }
    });

    return Promise.all(
      credentials.map(async (cred) => {
        let decryptedPassword: string | undefined;
        if (cred.password) {
          const metadata = cred.metadata as any;
          if (metadata?.passwordIv && metadata?.passwordAuthTag) {
            try {
              decryptedPassword = this.decrypt(
                cred.password,
                metadata.passwordIv,
                metadata.passwordAuthTag
              );
            } catch (error) {
              console.error('Failed to decrypt credential:', error);
            }
          }
        }

        return {
          id: cred.id,
          type: cred.type as CredentialType,
          username: cred.username,
          password: decryptedPassword,
          hash: cred.hash ?? undefined,
          domain: cred.domain ?? undefined,
          sourceHostId: cred.sourceHostId ?? undefined,
          createdAt: cred.createdAt
        };
      })
    );
  }

  async searchCredentials(query: {
    type?: CredentialType;
    username?: string;
    domain?: string;
  }): Promise<Credential[]> {
    const where: any = {};
    if (query.type) where.type = query.type;
    if (query.username) where.username = { contains: query.username, mode: 'insensitive' };
    if (query.domain) where.domain = query.domain;

    const credentials = await prisma.credential.findMany({
      where,
      include: { sourceHost: true }
    });

    return Promise.all(
      credentials.map(async (cred) => {
        let decryptedPassword: string | undefined;
        if (cred.password) {
          const metadata = cred.metadata as any;
          if (metadata?.passwordIv && metadata?.passwordAuthTag) {
            try {
              decryptedPassword = this.decrypt(
                cred.password,
                metadata.passwordIv,
                metadata.passwordAuthTag
              );
            } catch (error) {
              console.error('Failed to decrypt credential:', error);
            }
          }
        }

        return {
          id: cred.id,
          type: cred.type as CredentialType,
          username: cred.username,
          password: decryptedPassword,
          hash: cred.hash ?? undefined,
          domain: cred.domain ?? undefined,
          sourceHostId: cred.sourceHostId ?? undefined,
          createdAt: cred.createdAt
        };
      })
    );
  }

  async harvestCredentials(request: CredentialHarvestRequest): Promise<CredentialHarvestResult> {
    // This would integrate with implant agents to harvest credentials
    // For MVP, we'll simulate the harvest
    const harvestedCredentials: Credential[] = [];

    try {
      // Simulate credential harvesting based on methods
      for (const method of request.methods) {
        if (method === 'lsass') {
          // Simulate LSASS dump
          harvestedCredentials.push({
            id: randomUUID(),
            type: 'NTLM',
            username: 'Administrator',
            hash: 'aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0',
            domain: request.hostId,
            createdAt: new Date()
          });
        } else if (method === 'cached') {
          // Simulate cached credentials
          harvestedCredentials.push({
            id: randomUUID(),
            type: 'Plaintext',
            username: 'svc_account',
            password: 'P@ssw0rd123!',
            domain: request.hostId,
            createdAt: new Date()
          });
        }
      }

      // Store harvested credentials
      for (const cred of harvestedCredentials) {
        await this.storeCredential({
          ...cred,
          sourceHostId: request.hostId
        });
      }

      return {
        success: true,
        hostId: request.hostId,
        credentials: harvestedCredentials,
        method: request.methods.join(', ')
      };
    } catch (error) {
      return {
        success: false,
        hostId: request.hostId,
        credentials: [],
        method: request.methods.join(', '),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async deleteCredential(id: string): Promise<boolean> {
    try {
      await prisma.credential.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      console.error('Failed to delete credential:', error);
      return false;
    }
  }

  async getVaultStats(): Promise<{
    totalCredentials: number;
    byType: Record<string, number>;
    byDomain: Record<string, number>;
  }> {
    const credentials = await prisma.credential.findMany();

    const byType: Record<string, number> = {};
    const byDomain: Record<string, number> = {};

    for (const cred of credentials) {
      byType[cred.type] = (byType[cred.type] || 0) + 1;
      if (cred.domain) {
        byDomain[cred.domain] = (byDomain[cred.domain] || 0) + 1;
      }
    }

    return {
      totalCredentials: credentials.length,
      byType,
      byDomain
    };
  }
}

// Singleton instance
export const credentialVault = new CredentialVault();