/**
 * OSINT Email Harvester
 * Extracts and validates email addresses from various sources for targeting
 */

import { z } from 'zod';
import { httpGet } from '../infrastructure/http-client';
import { CACHE_TTL } from '../infrastructure/cache';

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const EmailSource = z.enum([
  'whois',
  'dns_mx',
  'website_content',
  'social_media',
  'data_breach',
  'certificate_transparency',
  'dns_txt'
]);
export type EmailSource = z.infer<typeof EmailSource>;

export const EmailConfidence = z.enum(['high', 'medium', 'low']);
export type EmailConfidence = z.infer<typeof EmailConfidence>;

export interface ExtractedEmail {
  email: string;
  source: EmailSource;
  confidence: EmailConfidence;
  domain?: string;
  extractedAt: number;
  metadata?: Record<string, any>;
}

export interface EmailHarvestResult {
  target: string;
  emails: ExtractedEmail[];
  sources: EmailSource[];
  timestamp: number;
  totalEmails: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

export interface EmailHarvestOptions {
  includeWhois?: boolean;
  includeDnsMx?: boolean;
  includeWebsiteContent?: boolean;
  includeDnsTxt?: boolean;
  maxEmailsPerSource?: number;
  validateEmails?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Email Validation                                                   */
/* ------------------------------------------------------------------ */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validate email address format
 */
export function validateEmailFormat(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Validate email domain has MX records
 */
export async function validateEmailDomain(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;

    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`;
    const response = await httpGet<any>(url, {
      rateLimitCategory: 'dns',
      useCache: true,
      cacheTtl: CACHE_TTL.dns,
    });

    return response.data?.Answer?.length > 0;
  } catch {
    return false;
  }
}

/**
 * Comprehensive email validation
 */
export async function validateEmail(email: string): Promise<boolean> {
  if (!validateEmailFormat(email)) return false;
  return await validateEmailDomain(email);
}

/* ------------------------------------------------------------------ */
/*  Email Extraction Functions                                         */
/* ------------------------------------------------------------------ */

/**
 * Extract emails from WHOIS data
 */
export function extractEmailsFromWhois(whoisData: string, domain: string): ExtractedEmail[] {
  const emails: ExtractedEmail[] = [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = whoisData.match(emailRegex);

  if (matches) {
    const uniqueEmails = new Set(matches);
    uniqueEmails.forEach(email => {
      if (validateEmailFormat(email)) {
        emails.push({
          email: email.toLowerCase(),
          source: 'whois',
          confidence: 'high',
          domain,
          extractedAt: Date.now(),
          metadata: { context: 'whois_registrant' }
        });
      }
    });
  }

  return emails;
}

/**
 * Extract emails from DNS MX records
 */
export async function extractEmailsFromDnsMx(domain: string): Promise<ExtractedEmail[]> {
  const emails: ExtractedEmail[] = [];

  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`;
    const response = await httpGet<any>(url, {
      rateLimitCategory: 'dns',
      useCache: true,
      cacheTtl: CACHE_TTL.dns,
    });

    if (response.data?.Answer) {
      // Extract potential email addresses from MX records
      // MX records typically contain mail server addresses, not direct emails
      // But we can infer common email addresses
      const commonPrefixes = ['admin', 'info', 'support', 'contact', 'webmaster', 'hostmaster', 'postmaster'];
      
      commonPrefixes.forEach(prefix => {
        emails.push({
          email: `${prefix}@${domain.toLowerCase()}`,
          source: 'dns_mx',
          confidence: 'medium',
          domain,
          extractedAt: Date.now(),
          metadata: { inferred: true, mx_records: response.data.Answer.length }
        });
      });
    }
  } catch (error) {
    console.error('Error extracting emails from DNS MX:', error);
  }

  return emails;
}

/**
 * Extract emails from DNS TXT records
 */
export async function extractEmailsFromDnsTxt(domain: string): Promise<ExtractedEmail[]> {
  const emails: ExtractedEmail[] = [];

  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`;
    const response = await httpGet<any>(url, {
      rateLimitCategory: 'dns',
      useCache: true,
      cacheTtl: CACHE_TTL.dns,
    });

    if (response.data?.Answer) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      
      response.data.Answer.forEach((record: any) => {
        const matches = record.data.match(emailRegex);
        if (matches) {
          matches.forEach((email: string) => {
            if (validateEmailFormat(email)) {
              emails.push({
                email: email.toLowerCase(),
                source: 'dns_txt',
                confidence: 'high',
                domain,
                extractedAt: Date.now(),
                metadata: { txt_record: record.data }
              });
            }
          });
        }
      });
    }
  } catch (error) {
    console.error('Error extracting emails from DNS TXT:', error);
  }

  return emails;
}

/**
 * Extract emails from website content
 */
export async function extractEmailsFromWebsite(url: string): Promise<ExtractedEmail[]> {
  const emails: ExtractedEmail[] = [];

  try {
    const response = await httpGet<string>(url, {
      rateLimitCategory: 'general',
      useCache: true,
      cacheTtl: CACHE_TTL.dns,
    });

    if (response.data) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = response.data.match(emailRegex);

      if (matches) {
        const uniqueEmails = new Set(matches);
        uniqueEmails.forEach((email: string) => {
          if (validateEmailFormat(email)) {
            // Determine confidence based on context
            let confidence: EmailConfidence = 'medium';
            const lowerData = response.data.toLowerCase();
            
            // High confidence indicators
            if (lowerData.includes('contact') || lowerData.includes('mailto:') || lowerData.includes('email')) {
              confidence = 'high';
            }
            
            emails.push({
              email: email.toLowerCase(),
              source: 'website_content',
              confidence,
              extractedAt: Date.now(),
              metadata: { source_url: url }
            });
          }
        });
      }
    }
  } catch (error) {
    console.error('Error extracting emails from website:', error);
  }

  return emails;
}

/**
 * Extract emails from certificate transparency logs
 */
export async function extractEmailsFromCertificates(domain: string): Promise<ExtractedEmail[]> {
  const emails: ExtractedEmail[] = [];

  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
    const response = await httpGet<any[]>(url, {
      rateLimitCategory: 'dns',
      useCache: true,
      cacheTtl: CACHE_TTL.subdomains,
    });

    if (response.data) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      
      response.data.forEach(cert => {
        const nameValue = cert.name_value;
        if (nameValue) {
          const matches = nameValue.match(emailRegex);
          if (matches) {
            matches.forEach((email: string) => {
              if (validateEmailFormat(email)) {
                emails.push({
                  email: email.toLowerCase(),
                  source: 'certificate_transparency',
                  confidence: 'medium',
                  domain,
                  extractedAt: Date.now(),
                  metadata: { certificate_id: cert.id }
                });
              }
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('Error extracting emails from certificates:', error);
  }

  return emails;
}

/* ------------------------------------------------------------------ */
/*  Comprehensive Email Harvesting                                    */
/* ------------------------------------------------------------------ */

/**
 * Perform comprehensive email harvesting for a target
 */
export async function harvestEmails(
  target: string,
  options: EmailHarvestOptions = {}
): Promise<EmailHarvestResult> {
  const {
    includeWhois = true,
    includeDnsMx = true,
    includeWebsiteContent = true,
    includeDnsTxt = true,
    maxEmailsPerSource = 50,
    validateEmails = true,
  } = options;

  const allEmails: ExtractedEmail[] = [];
  const sources: EmailSource[] = [];

  // Extract from WHOIS
  if (includeWhois) {
    try {
      const whois = require('whois');
      const whoisData = await new Promise<string>((resolve, reject) => {
        whois.lookup(target, (err: Error | null, data: string) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const whoisEmails = extractEmailsFromWhois(whoisData, target);
      allEmails.push(...whoisEmails.slice(0, maxEmailsPerSource));
      if (whoisEmails.length > 0) sources.push('whois');
    } catch (error) {
      console.error('WHOIS email extraction failed:', error);
    }
  }

  // Extract from DNS MX
  if (includeDnsMx) {
    try {
      const mxEmails = await extractEmailsFromDnsMx(target);
      allEmails.push(...mxEmails.slice(0, maxEmailsPerSource));
      if (mxEmails.length > 0) sources.push('dns_mx');
    } catch (error) {
      console.error('DNS MX email extraction failed:', error);
    }
  }

  // Extract from DNS TXT
  if (includeDnsTxt) {
    try {
      const txtEmails = await extractEmailsFromDnsTxt(target);
      allEmails.push(...txtEmails.slice(0, maxEmailsPerSource));
      if (txtEmails.length > 0) sources.push('dns_txt');
    } catch (error) {
      console.error('DNS TXT email extraction failed:', error);
    }
  }

  // Extract from website content
  if (includeWebsiteContent) {
    try {
      const websiteUrl = target.startsWith('http') ? target : `https://${target}`;
      const websiteEmails = await extractEmailsFromWebsite(websiteUrl);
      allEmails.push(...websiteEmails.slice(0, maxEmailsPerSource));
      if (websiteEmails.length > 0) sources.push('website_content');
    } catch (error) {
      console.error('Website email extraction failed:', error);
    }
  }

  // Extract from certificate transparency
  try {
    const certEmails = await extractEmailsFromCertificates(target);
    allEmails.push(...certEmails.slice(0, maxEmailsPerSource));
    if (certEmails.length > 0) sources.push('certificate_transparency');
  } catch (error) {
    console.error('Certificate email extraction failed:', error);
  }

  // Remove duplicates
  const uniqueEmails = new Map<string, ExtractedEmail>();
  allEmails.forEach(email => {
    const key = email.email;
    if (!uniqueEmails.has(key) || uniqueEmails.get(key)!.confidence < email.confidence) {
      uniqueEmails.set(key, email);
    }
  });

  const finalEmails = Array.from(uniqueEmails.values());

  // Validate emails if requested
  let validatedEmails = finalEmails;
  if (validateEmails) {
    const validationPromises = finalEmails.map(async (email) => {
      const isValid = await validateEmail(email.email);
      return { ...email, valid: isValid };
    });
    
    const validationResults = await Promise.all(validationPromises);
    validatedEmails = validationResults.filter(e => e.valid).map(({ valid, ...e }) => e);
  }

  // Count by confidence
  const highConfidence = validatedEmails.filter(e => e.confidence === 'high').length;
  const mediumConfidence = validatedEmails.filter(e => e.confidence === 'medium').length;
  const lowConfidence = validatedEmails.filter(e => e.confidence === 'low').length;

  return {
    target,
    emails: validatedEmails,
    sources: Array.from(new Set(sources)),
    timestamp: Date.now(),
    totalEmails: validatedEmails.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
  };
}

/**
 * Get unique email addresses from harvest result
 */
export function getUniqueEmails(result: EmailHarvestResult, minConfidence?: EmailConfidence): string[] {
  let emails = result.emails;
  
  if (minConfidence) {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    const minLevel = confidenceOrder[minConfidence];
    emails = emails.filter(e => confidenceOrder[e.confidence] >= minLevel);
  }
  
  return Array.from(new Set(emails.map(e => e.email)));
}

/**
 * Export emails to CSV format
 */
export function exportEmailsToCsv(result: EmailHarvestResult): string {
  const headers = ['email', 'source', 'confidence', 'domain', 'extracted_at'];
  const rows = result.emails.map(e => [
    e.email,
    e.source,
    e.confidence,
    e.domain || '',
    new Date(e.extractedAt).toISOString()
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}