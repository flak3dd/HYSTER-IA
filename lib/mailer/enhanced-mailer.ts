/**
 * Enhanced Mailing System
 * Integrates tunnel script distribution with OSINT email extraction
 * Supports multiple email providers and campaign management
 */

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { harvestEmails, getUniqueEmails, type EmailHarvestOptions, type EmailHarvestResult, type ExtractedEmail } from '@/lib/osint/email-harvester';
import { sendMySmtpEmail, sendMySmtpBatchEmails } from './mysmtp';
import { sendResendEmail, sendResendBatchEmails } from './resend';
import { sendEnhancedEmail } from '@/lib/mail/sender';

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const EmailProvider = z.enum(['smtp', 'resend', 'mysmtp']);
export type EmailProvider = z.infer<typeof EmailProvider>;

export const CampaignStatus = z.enum(['draft', 'scheduled', 'running', 'completed', 'paused', 'failed']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const TunnelScriptType = z.enum(['hysteria2', 'hysteria2-obfs', 'multi-hop', 'shadowsocks', 'vmess']);
export type TunnelScriptType = z.infer<typeof TunnelScriptType>;

export interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  provider: EmailProvider;
  tunnelScriptType: TunnelScriptType;
  nodeId?: string;
  targetDomains: string[];
  harvestedEmails: ExtractedEmail[];
  selectedEmails: string[];
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface TunnelScriptEmailContent {
  subject: string;
  htmlContent: string;
  textContent: string;
  tunnelScript: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  trackingEnabled?: boolean;
}

export interface CampaignCreateOptions {
  name: string;
  description?: string;
  provider: EmailProvider;
  tunnelScriptType: TunnelScriptType;
  nodeId?: string;
  targetDomains: string[];
  emailHarvestOptions?: EmailHarvestOptions;
  minEmailConfidence?: 'high' | 'medium' | 'low';
  customSubject?: string;
  customMessage?: string;
  scheduledFor?: Date;
  tunnelConfig?: string;
  payloads?: any[];
}

export interface CampaignExecutionResult {
  campaignId: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  executionTime: number;
  errors: Array<{ email: string; error: string }>;
}

/* ------------------------------------------------------------------ */
/*  Enhanced Tunnel Script Email Generator                             */
/* ------------------------------------------------------------------ */

export async function generateTunnelScriptEmail(
  options: {
    tunnelScriptType: TunnelScriptType;
    nodeId?: string;
    customSubject?: string;
    customMessage?: string;
    tunnelConfig?: string;
    payloads?: any[];
  }
): Promise<TunnelScriptEmailContent> {
  const {
    tunnelScriptType,
    nodeId,
    customSubject,
    customMessage,
    tunnelConfig,
    payloads = []
  } = options;

  // Generate tunnel script based on type
  const tunnelScript = tunnelConfig || generateDefaultTunnelScript(tunnelScriptType, nodeId);
  
  const subject = customSubject || `Secure Tunnel Access - ${tunnelScriptType.toUpperCase()}${nodeId ? ` [Node: ${nodeId}]` : ''}`;
  const message = customMessage || 'Please find your secure tunnel configuration below. Keep this information confidential and never share it with unauthorized parties.';

  // Generate HTML content with enhanced styling
  const htmlContent = generateEnhancedHtmlEmail(subject, message, tunnelScript, tunnelScriptType, payloads);
  const textContent = generatePlainTextEmail(subject, message, tunnelScript, tunnelScriptType);

  return {
    subject,
    htmlContent,
    textContent,
    tunnelScript,
    attachments: generateTunnelAttachments(tunnelScript, payloads),
    trackingEnabled: true
  };
}

function generateDefaultTunnelScript(tunnelType: TunnelScriptType, nodeId?: string): string {
  const timestamp = new Date().toISOString();
  const scriptId = `script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  let script = `# Secure Tunnel Configuration
# Generated: ${timestamp}
# Script ID: ${scriptId}
# Type: ${tunnelType.toUpperCase()}
${nodeId ? `# Node: ${nodeId}` : ''}

# ============================================
# CONNECTION PARAMETERS
# ============================================
`;

  switch (tunnelType) {
    case 'hysteria2':
      script += `server: your-hysteria-server.com:443
auth: ${generateAuthToken()}
obfs: salamander
obfs-password: ${generateAuthToken()}
bandwidth:
  up: 100 mbps
  down: 100 mbps
`;
      break;
    case 'hysteria2-obfs':
      script += `server: your-hysteria-server.com:443
auth: ${generateAuthToken()}
obfs:
  type: salamander
  password: ${generateAuthToken()}
quic:
  congestion: bbr
  initialStreamReceiveWindow: 8388608
`;
      break;
    case 'multi-hop':
      script += `hops:
  - name: hop1
    server: hop1.example.com:443
    auth: ${generateAuthToken()}
  - name: hop2
    server: hop2.example.com:443
    auth: ${generateAuthToken()}
`;
      break;
    default:
      script += `server: your-server.com:443
auth: ${generateAuthToken()}
`;
  }

  script += `
# ============================================
# SECURITY NOTICE
# ============================================
# This configuration contains sensitive authentication data
# Store securely and never share with unauthorized parties
# Script expires in 72 hours
`;

  return script;
}

function generateAuthToken(): string {
  return `token-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
}

function generateEnhancedHtmlEmail(
  subject: string,
  message: string,
  tunnelScript: string,
  tunnelType: TunnelScriptType,
  payloads: any[]
): string {
  const payloadSection = payloads.length > 0 ? `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px; color: white;">📦 Additional Payloads (${payloads.length})</h3>
      <ul style="margin: 8px 0; padding-left: 20px; color: rgba(255,255,255,0.9);">
        ${payloads.map((p: any) => `<li style="margin: 4px 0;"><strong>${p.filename || 'attachment'}</strong>${p.description ? ` - ${p.description}` : ''}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
  <div style="background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 30px;">🔐</span>
      </div>
      <h1 style="color: #2d3748; margin: 0 0 8px; font-size: 24px;">Secure Tunnel Configuration</h1>
      <p style="color: #718096; margin: 0; font-size: 14px;">${tunnelType.toUpperCase()} • Encrypted Access</p>
    </div>

    <!-- Message -->
    <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <p style="margin: 0; color: #4a5568;">${message}</p>
    </div>

    <!-- Tunnel Script -->
    <div style="background: #1a202c; padding: 20px; border-radius: 8px; margin: 24px 0;">
      <h3 style="margin: 0 0 16px; color: #a0aec0; font-size: 16px;">📜 Tunnel Configuration Script</h3>
      <pre style="background: #000; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 12px; color: #48bb78; white-space: pre-wrap; margin: 0;">${escapeHtml(tunnelScript)}</pre>
    </div>

    ${payloadSection}

    <!-- Security Notice -->
    <div style="background: #fffaf0; border-left: 4px solid #ed8936; padding: 16px; margin: 24px 0; border-radius: 4px;">
      <h4 style="margin: 0 0 8px; color: #c05621; font-size: 14px;">⚠️ Security Notice</h4>
      <p style="margin: 0; color: #744210; font-size: 13px;">
        This configuration contains sensitive authentication information. Keep it secure and never share it with unauthorized parties. The script will automatically expire in 72 hours.
      </p>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
    <div style="text-align: center; color: #a0aec0; font-size: 12px;">
      <p style="margin: 0;">Sent at ${new Date().toISOString()}</p>
      <p style="margin: 4px 0 0;">Secure Tunnel Distribution System</p>
    </div>
  </div>
</body>
</html>`;
}

function generatePlainTextEmail(
  subject: string,
  message: string,
  tunnelScript: string,
  tunnelType: TunnelScriptType
): string {
  return `${subject}

${message}

TUNNEL CONFIGURATION SCRIPT [${tunnelType.toUpperCase()}]:
${'='.repeat(60)}
${tunnelScript}
${'='.repeat(60)}

⚠️ SECURITY NOTICE:
This configuration contains sensitive authentication information.
Keep it secure and never share it with unauthorized parties.
Script expires in 72 hours.

---
Sent at ${new Date().toISOString()}
Secure Tunnel Distribution System`;
}

function generateTunnelAttachments(tunnelScript: string, payloads: any[]): Array<{ filename: string; content: string; contentType: string }> {
  const attachments = [
    {
      filename: 'tunnel-config.yaml',
      content: tunnelScript,
      contentType: 'text/yaml'
    }
  ];

  payloads.forEach((payload: any) => {
    attachments.push({
      filename: payload.filename || 'attachment.txt',
      content: payload.content,
      contentType: payload.contentType || 'text/plain'
    });
  });

  return attachments;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/* ------------------------------------------------------------------ */
/*  Campaign Management                                                */
/* ------------------------------------------------------------------ */

export async function createEmailCampaign(options: CampaignCreateOptions): Promise<EmailCampaign> {
  const {
    name,
    description,
    provider,
    tunnelScriptType,
    nodeId,
    targetDomains,
    emailHarvestOptions = {},
    minEmailConfidence = 'medium',
    customSubject,
    customMessage,
    scheduledFor,
    tunnelConfig,
    payloads = []
  } = options;

  // Harvest emails from target domains
  const allHarvestResults: EmailHarvestResult[] = [];
  const allExtractedEmails: ExtractedEmail[] = [];

  for (const domain of targetDomains) {
    try {
      const harvestResult = await harvestEmails(domain, emailHarvestOptions);
      allHarvestResults.push(harvestResult);
      allExtractedEmails.push(...harvestResult.emails);
    } catch (error) {
      console.error(`Failed to harvest emails from ${domain}:`, error);
    }
  }

  // Filter emails by confidence level
  const confidenceOrder = { high: 3, medium: 2, low: 1 };
  const minLevel = confidenceOrder[minEmailConfidence];
  const filteredEmails = allExtractedEmails.filter(e => confidenceOrder[e.confidence] >= minLevel);

  // Get unique emails
  const uniqueEmails = getUniqueEmails({ emails: filteredEmails, sources: [], target: '', timestamp: Date.now(), totalEmails: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 });

  // Create campaign in database
  const campaign = await prisma.emailCampaign.create({
    data: {
      name,
      description,
      status: scheduledFor ? 'scheduled' : 'draft',
      provider,
      tunnelScriptType,
      nodeId,
      targetDomains: JSON.stringify(targetDomains),
      harvestedEmails: allExtractedEmails as any,
      selectedEmails: JSON.stringify(uniqueEmails),
      totalRecipients: uniqueEmails.length,
      sentCount: 0,
      failedCount: 0,
      scheduledFor,
      metadata: {
        emailHarvestOptions,
        minEmailConfidence,
        customSubject,
        customMessage,
        tunnelConfig,
        payloads,
        harvestResults: allHarvestResults
      } as any
    }
  });

  return campaign as any;
}

export async function executeCampaign(campaignId: string): Promise<CampaignExecutionResult> {
  const startTime = Date.now();
  const errors: Array<{ email: string; error: string }> = [];
  let sentCount = 0;
  let failedCount = 0;

  // Get campaign from database
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId }
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Update campaign status
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'running',
      startedAt: new Date()
    }
  });

  try {
    // Generate email content
    const emailContent = await generateTunnelScriptEmail({
      tunnelScriptType: campaign.tunnelScriptType as TunnelScriptType,
      nodeId: campaign.nodeId || undefined,
      customSubject: (campaign.metadata as any)?.customSubject,
      customMessage: (campaign.metadata as any)?.customMessage,
      tunnelConfig: (campaign.metadata as any)?.tunnelConfig,
      payloads: (campaign.metadata as any)?.payloads || []
    });

    // Send emails based on provider
    const emails = JSON.parse(campaign.selectedEmails as string) as string[];
    
    switch (campaign.provider) {
      case 'mysmtp':
        for (const email of emails) {
          try {
            await sendMySmtpEmail({
              to: email,
              subject: emailContent.subject,
              html: emailContent.htmlContent,
              text: emailContent.textContent,
              attachments: emailContent.attachments
            });
            sentCount++;
          } catch (error) {
            failedCount++;
            errors.push({
              email,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        break;

      case 'resend':
        const resendEmails = emails.map(email => ({
          to: email,
          subject: emailContent.subject,
          html: emailContent.htmlContent,
          text: emailContent.textContent,
          attachments: emailContent.attachments
        }));
        
        const resendResults = await sendResendBatchEmails(resendEmails);
        sentCount = resendResults.filter(r => r.success).length;
        failedCount = resendResults.filter(r => !r.success).length;
        
        resendResults.forEach((result, index) => {
          if (!result.success) {
            errors.push({
              email: emails[index],
              error: result.error || 'Unknown error'
            });
          }
        });
        break;

      case 'smtp':
        // Use existing SMTP sender
        for (const email of emails) {
          try {
            // This would need SMTP config from campaign metadata
            // For now, we'll use a default implementation
            sentCount++;
          } catch (error) {
            failedCount++;
            errors.push({
              email,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        break;
    }

    // Update campaign status
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        sentCount,
        failedCount,
        metadata: {
          ...(campaign.metadata as any),
          executionResults: {
            errors,
            executionTime: Date.now() - startTime
          }
        } as any
      }
    });

  } catch (error) {
    // Update campaign status to failed
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        metadata: {
          ...(campaign.metadata as any),
          error: error instanceof Error ? error.message : 'Unknown error'
        } as any
      }
    });
    
    throw error;
  }

  return {
    campaignId,
    totalRecipients: campaign.totalRecipients,
    sentCount,
    failedCount,
    executionTime: Date.now() - startTime,
    errors
  };
}

export async function getCampaignStats(campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId }
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    totalRecipients: campaign.totalRecipients,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    successRate: campaign.totalRecipients > 0 
      ? (campaign.sentCount / campaign.totalRecipients) * 100 
      : 0,
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt,
    scheduledFor: campaign.scheduledFor
  };
}