import { z } from 'zod'
import { httpGet, httpPost } from '../infrastructure/http-client'
import { CACHE_TTL } from '../infrastructure/cache'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const OtxIndicatorType = z.enum([
  'IPv4',
  'IPv6',
  'domain',
  'hostname',
  'email',
  'URL',
  'URI',
  'FileHash-MD5',
  'FileHash-SHA1',
  'FileHash-SHA256',
  'CIDR',
  'FilePath',
  'Mutex',
  'CVE',
])
export type OtxIndicatorType = z.infer<typeof OtxIndicatorType>

export interface OtxPulse {
  id: string
  name: string
  description: string
  author_name: string
  created: string
  modified: string
  TLP: string
  tags: string[]
  indicators: OtxIndicator[]
  adversary: string[]
  malware_families: string[]
  attack_ids: string[]
}

export interface OtxIndicator {
  id: string
  type: OtxIndicatorType
  indicator: string
  description: string
  created: string
  modified: string
  role: string
  title: string
  content: string
  access_type: string
  access_reason: string
  access_status: string
}

export interface OtxSection {
  id: string
  title: string
  type: string
  body: string
  author: {
    id: string
    username: string
  }
  created: string
}

export interface OtxVote {
  id: string
  value: number
  voters: string[]
}

export interface OtxAnalysis {
  reputation: number
  severity: string
  sections: OtxSection[]
  votes: OtxVote[]
  pulse_info: {
    count: number
    pulses: Array<{
      id: string
      name: string
      description: string
      tags: string[]
      modified: string
    }>
  }
}

/* ------------------------------------------------------------------ */
/*  AlienVault OTX API Client                                         */
/* ------------------------------------------------------------------ */

class AlienVaultOtxClient {
  private apiKey: string
  private baseUrl = 'https://otx.alienvault.com/api/v1'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ALIENVAULT_OTX_KEY || ''
    if (!this.apiKey) {
      throw new Error('AlienVault OTX API key is required')
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'X-OTX-API-KEY': this.apiKey,
      'accept': 'application/json',
    }
  }

  /**
   * Generic GET request to OTX API
   */
  private async get<T>(endpoint: string, useCache = true): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await httpGet<T>(url, {
      headers: this.getHeaders(),
      rateLimitCategory: 'threatIntel',
      useCache,
      cacheTtl: CACHE_TTL.threatIntel,
    })

    return response.data
  }

  /**
   * Generic POST request to OTX API
   */
  private async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await httpPost<T>(url, body, {
      headers: this.getHeaders(),
      rateLimitCategory: 'threatIntel',
    })

    return response.data
  }

  /* ------------------------------------------------------------------ */
  /*  Indicator Analysis                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Get analysis for an IPv4 address
   * @param ip - IPv4 address
   * @returns Analysis results
   */
  async getIpv4Analysis(ip: string): Promise<OtxAnalysis> {
    return this.get<OtxAnalysis>(`/indicators/IPv4/${ip}/general`)
  }

  /**
   * Get analysis for a domain
   * @param domain - Domain
   * @returns Analysis results
   */
  async getDomainAnalysis(domain: string): Promise<OtxAnalysis> {
    return this.get<OtxAnalysis>(`/indicators/domain/${domain}/general`)
  }

  /**
   * Get analysis for a hostname
   * @param hostname - Hostname
   * @returns Analysis results
   */
  async getHostnameAnalysis(hostname: string): Promise<OtxAnalysis> {
    return this.get<OtxAnalysis>(`/indicators/hostname/${hostname}/general`)
  }

  /**
   * Get analysis for a URL
   * @param url - URL
   * @returns Analysis results
   */
  async getUrlAnalysis(url: string): Promise<OtxAnalysis> {
    const encodedUrl = encodeURIComponent(url)
    return this.get<OtxAnalysis>(`/indicators/URL/${encodedUrl}/general`)
  }

  /**
   * Get analysis for an email address
   * @param email - Email address
   * @returns Analysis results
   */
  async getEmailAnalysis(email: string): Promise<OtxAnalysis> {
    return this.get<OtxAnalysis>(`/indicators/email/${email}/general`)
  }

  /**
   * Get analysis for a file hash
   * @param hash - File hash (MD5, SHA1, or SHA256)
   * @returns Analysis results
   */
  async getFileHashAnalysis(hash: string): Promise<OtxAnalysis> {
    return this.get<OtxAnalysis>(`/indicators/file/${hash}/general`)
  }

  /* ------------------------------------------------------------------ */
  /*  DNS Records                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Get DNS records for a domain
   * @param domain - Domain
   * @returns DNS records
   */
  async getDomainPassiveDns(domain: string): Promise<Record<string, unknown>> {
    return this.get(`/indicators/domain/${domain}/passive_dns`)
  }

  /**
   * Get DNS records for an IP address
   * @param ip - IP address
   * @returns DNS records
   */
  async getIpPassiveDns(ip: string): Promise<Record<string, unknown>> {
    return this.get(`/indicators/IPv4/${ip}/passive_dns`)
  }

  /* ------------------------------------------------------------------ */
  /*  URL List                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Get URLs associated with a domain
   * @param domain - Domain
   * @returns List of URLs
   */
  async getDomainUrlList(domain: string): Promise<Record<string, unknown>> {
    return this.get(`/indicators/domain/${domain}/url_list`)
  }

  /**
   * Get URLs associated with an IP address
   * @param ip - IP address
   * @returns List of URLs
   */
  async getIpUrlList(ip: string): Promise<Record<string, unknown>> {
    return this.get(`/indicators/IPv4/${ip}/url_list`)
  }

  /* ------------------------------------------------------------------ */
  /*  Malware Samples                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Get malware samples associated with a domain
   * @param domain - Domain
   * @returns Malware samples
   */
  async getDomainMalwareSamples(domain: string): Promise<Record<string, unknown>> {
    return this.get(`/indicators/domain/${domain}/malware_samples`)
  }

  /**
   * Get malware samples associated with an IP address
   * @param ip - IP address
   * @returns Malware samples
   */
  async getIpMalwareSamples(ip: string): Promise<Record<string, unknown>> {
    return this.get(`/indicators/IPv4/${ip}/malware_samples`)
  }

  /* ------------------------------------------------------------------ */
  /*  Pulse Management                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Get recent pulses
   * @param limit - Number of pulses to retrieve (max 20)
   * @returns Array of pulses
   */
  async getPulses(limit: number = 20): Promise<OtxPulse[]> {
    return this.get<OtxPulse[]>(`/pulses/subscribed?page=1&limit=${limit}`)
  }

  /**
   * Get pulses by tag
   * @param tag - Tag to search for
   * @param limit - Number of pulses to retrieve (max 20)
   * @returns Array of pulses
   */
  async getPulsesByTag(tag: string, limit: number = 20): Promise<OtxPulse[]> {
    return this.get<OtxPulse[]>(`/pulses/subscribed?page=1&limit=${limit}&tag=${encodeURIComponent(tag)}`)
  }

  /**
   * Get a specific pulse by ID
   * @param pulseId - Pulse ID
   * @returns Pulse details
   */
  async getPulse(pulseId: string): Promise<OtxPulse> {
    return this.get<OtxPulse>(`/pulses/${pulseId}`)
  }

  /**
   * Search pulses
   * @param query - Search query
   * @param limit - Number of results (max 20)
   * @returns Array of pulses
   */
  async searchPulses(query: string, limit: number = 20): Promise<OtxPulse[]> {
    return this.get<OtxPulse[]>(`/search/pulses?q=${encodeURIComponent(query)}&page=1&limit=${limit}`)
  }

  /* ------------------------------------------------------------------ */
  /*  User Subscriptions                                               */
   /* ------------------------------------------------------------------ */

  /**
   * Get user's subscribed pulses
   * @param limit - Number of pulses to retrieve (max 20)
   * @returns Array of pulses
   */
  async getMyPulses(limit: number = 20): Promise<OtxPulse[]> {
    return this.get<OtxPulse[]>(`/pulses/my?page=1&limit=${limit}`)
  }

  /**
   * Get user's created pulses
   * @param limit - Number of pulses to retrieve (max 20)
   * @returns Array of pulses
   */
  async getMyCreatedPulses(limit: number = 20): Promise<OtxPulse[]> {
    return this.get<OtxPulse[]>(`/pulses/my?page=1&limit=${limit}`)
  }
}

// Create singleton instance
let otxClient: AlienVaultOtxClient | null = null

/**
 * Get AlienVault OTX client instance
 */
export function getOtxClient(): AlienVaultOtxClient {
  if (!otxClient) {
    otxClient = new AlienVaultOtxClient()
  }
  return otxClient
}

/* ------------------------------------------------------------------ */
/*  Convenience Functions                                              */
/* ------------------------------------------------------------------ */

/**
 * Analyze an IPv4 address
 * @param ip - IP address to analyze
 * @returns Analysis result with summary
 */
export async function analyzeOtxIpv4(ip: string): Promise<{
  ip: string
  reputation: number
  severity: string
  malicious: boolean
  pulseCount: number
  pulses: Array<{
    id: string
    name: string
    tags: string[]
    modified: string
  }>
  raw: OtxAnalysis
}> {
  const client = getOtxClient()
  const analysis = await client.getIpv4Analysis(ip)

  return {
    ip,
    reputation: analysis.reputation,
    severity: analysis.severity,
    malicious: analysis.reputation < 50, // Reputation < 50 is considered malicious
    pulseCount: analysis.pulse_info.count,
    pulses: analysis.pulse_info.pulses,
    raw: analysis,
  }
}

/**
 * Analyze a domain
 * @param domain - Domain to analyze
 * @returns Analysis result with summary
 */
export async function analyzeOtxDomain(domain: string): Promise<{
  domain: string
  reputation: number
  severity: string
  malicious: boolean
  pulseCount: number
  pulses: Array<{
    id: string
    name: string
    tags: string[]
    modified: string
  }>
  raw: OtxAnalysis
}> {
  const client = getOtxClient()
  const analysis = await client.getDomainAnalysis(domain)

  return {
    domain,
    reputation: analysis.reputation,
    severity: analysis.severity,
    malicious: analysis.reputation < 50,
    pulseCount: analysis.pulse_info.count,
    pulses: analysis.pulse_info.pulses,
    raw: analysis,
  }
}

/**
 * Analyze a URL
 * @param url - URL to analyze
 * @returns Analysis result with summary
 */
export async function analyzeOtxUrl(url: string): Promise<{
  url: string
  reputation: number
  severity: string
  malicious: boolean
  pulseCount: number
  pulses: Array<{
    id: string
    name: string
    tags: string[]
    modified: string
  }>
  raw: OtxAnalysis
}> {
  const client = getOtxClient()
  const analysis = await client.getUrlAnalysis(url)

  return {
    url,
    reputation: analysis.reputation,
    severity: analysis.severity,
    malicious: analysis.reputation < 50,
    pulseCount: analysis.pulse_info.count,
    pulses: analysis.pulse_info.pulses,
    raw: analysis,
  }
}

/**
 * Analyze a file hash
 * @param hash - File hash to analyze
 * @returns Analysis result with summary
 */
export async function analyzeOtxFileHash(hash: string): Promise<{
  hash: string
  reputation: number
  severity: string
  malicious: boolean
  pulseCount: number
  pulses: Array<{
    id: string
    name: string
    tags: string[]
    modified: string
  }>
  raw: OtxAnalysis
}> {
  const client = getOtxClient()
  const analysis = await client.getFileHashAnalysis(hash)

  return {
    hash,
    reputation: analysis.reputation,
    severity: analysis.severity,
    malicious: analysis.reputation < 50,
    pulseCount: analysis.pulse_info.count,
    pulses: analysis.pulse_info.pulses,
    raw: analysis,
  }
}
