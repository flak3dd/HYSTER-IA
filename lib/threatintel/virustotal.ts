import { z } from 'zod'
import { httpGet, httpPost } from '../infrastructure/http-client'
import { CACHE_TTL } from '../infrastructure/cache'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const VirusTotalResourceType = z.enum([
  'ip_addresses',
  'domains',
  'urls',
  'files',
  'hashes',
])
export type VirusTotalResourceType = z.infer<typeof VirusTotalResourceType>

export interface VirusTotalAnalysis {
  stats: {
    malicious: number
    suspicious: number
    harmless: number
    timeout: number
      undetected: number
  }
  results: Record<string, {
    category: string
    result: string
    method: string
    engine_name: string
  }>
}

export interface VirusTotalAttributes {
  last_analysis_stats?: {
    malicious: number
    suspicious: number
    harmless: number
    timeout: number
      undetected: number
  }
  last_analysis_results?: VirusTotalAnalysis['results']
  reputation?: number
  country?: string
  continent?: string
  network?: string
  asn?: number
  as_owner?: string
  tags?: string[]
  creation_date?: number
  last_modification_date?: number
  last_dns_records?: Array<{
    type: string
    value: string
  }>
  categories?: Record<string, string>
  [key: string]: unknown
}

type VirusTotalCollectionResponse = {
  data?: unknown[]
  meta?: Record<string, unknown>
  links?: Record<string, string>
}

export interface VirusTotalResponse {
  data: {
    id: string
    type: string
    links: Record<string, string>
    attributes: VirusTotalAttributes
  }
  meta?: {
    url_info?: {
      id?: string
    }
  }
}

export interface VirusTotalError {
  error: {
    code: string
    message: string
  }
}

/* ------------------------------------------------------------------ */
/*  VirusTotal API Client                                             */
/* ------------------------------------------------------------------ */

class VirusTotalClient {
  private apiKey: string
  private baseUrl = 'https://www.virustotal.com/api/v3'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VIRUSTOTAL_API_KEY || ''
    if (!this.apiKey) {
      throw new Error('VirusTotal API key is required')
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'x-apikey': this.apiKey,
      'accept': 'application/json',
    }
  }

  /**
   * Generic GET request to VirusTotal API
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
   * Generic POST request to VirusTotal API
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
  /*  IP Address Analysis                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Get information about an IP address
   * @param ip - IP address to analyze
   * @returns IP address information
   */
  async getIpAddress(ip: string): Promise<VirusTotalResponse> {
    return this.get<VirusTotalResponse>(`/ip_addresses/${ip}`)
  }

  /**
   * Get DNS records for an IP address
   * @param ip - IP address
   * @returns DNS records
   */
  async getIpAddressDnsRecords(ip: string): Promise<VirusTotalCollectionResponse> {
    return this.get(`/ip_addresses/${ip}/dns_records`)
  }

  /**
   * Get historical WHOIS data for an IP address
   * @param ip - IP address
   * @returns Historical WHOIS data
   */
  async getIpAddressHistoricalWhois(ip: string): Promise<VirusTotalCollectionResponse> {
    return this.get(`/ip_addresses/${ip}/historical_whois`)
  }

  /* ------------------------------------------------------------------ */
  /*  Domain Analysis                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Get information about a domain
   * @param domain - Domain to analyze
   * @returns Domain information
   */
  async getDomain(domain: string): Promise<VirusTotalResponse> {
    return this.get<VirusTotalResponse>(`/domains/${domain}`)
  }

  /**
   * Get DNS records for a domain
   * @param domain - Domain
   * @returns DNS records
   */
  async getDomainDnsRecords(domain: string): Promise<VirusTotalCollectionResponse> {
    return this.get(`/domains/${domain}/dns_records`)
  }

  /**
   * Get related domains
   * @param domain - Domain
   * @returns Related domains
   */
  async getDomainRelatedDomains(domain: string): Promise<VirusTotalCollectionResponse> {
    return this.get(`/domains/${domain}/related_domains`)
  }

  /**
   * Get subdomains
   * @param domain - Domain
   * @returns Subdomains
   */
  async getDomainSubdomains(domain: string): Promise<VirusTotalCollectionResponse> {
    return this.get(`/domains/${domain}/subdomains`)
  }

  /* ------------------------------------------------------------------ */
  /*  URL Analysis                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Get information about a URL
   * @param url - URL to analyze
   * @returns URL information
   */
  async getUrl(url: string): Promise<VirusTotalResponse> {
    // URLs need to be base64 encoded
    const urlId = this.urlEncode(url)
    return this.get<VirusTotalResponse>(`/urls/${urlId}`)
  }

  /**
   * Submit a URL for analysis
   * @param url - URL to analyze
   * @returns Analysis ID
   */
  async submitUrl(url: string): Promise<VirusTotalResponse> {
    return this.post('/urls', { url })
  }

  /**
   * Get analysis result for a submitted URL
   * @param analysisId - Analysis ID
   * @returns Analysis result
   */
  async getAnalysis(analysisId: string): Promise<VirusTotalResponse> {
    return this.get(`/analyses/${analysisId}`, false)
  }

  /**
   * Encode URL for VirusTotal API
   */
  private urlEncode(url: string): string {
    return Buffer.from(url).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  /* ------------------------------------------------------------------ */
  /*  File Analysis                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Get information about a file by hash
   * @param hash - File hash (MD5, SHA1, or SHA256)
   * @returns File information
   */
  async getFile(hash: string): Promise<VirusTotalResponse> {
    return this.get<VirusTotalResponse>(`/files/${hash}`)
  }

  /**
   * Submit a file for analysis
   * @param file - File to analyze (as Buffer or File object)
   * @returns Analysis ID
   */
  async submitFile(file: Buffer | File): Promise<unknown> {
    const formData = new FormData()
    if (Buffer.isBuffer(file)) {
      formData.append('file', new Blob([new Uint8Array(file)]), 'file')
    } else {
      formData.append('file', file)
    }

    const url = `${this.baseUrl}/files`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-apikey': this.apiKey,
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`File submission failed: ${response.statusText}`)
    }

    return response.json()
  }

  /* ------------------------------------------------------------------ */
  /*  Utility Functions                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Check if a resource is malicious based on analysis stats
   * @param response - VirusTotal API response
   * @returns True if malicious
   */
  isMalicious(response: VirusTotalResponse): boolean {
    const stats = response.data.attributes.last_analysis_stats
    return stats ? stats.malicious > 0 : false
  }

  /**
   * Get malware detection percentage
   * @param response - VirusTotal API response
   * @returns Detection percentage (0-100)
   */
  getDetectionPercentage(response: VirusTotalResponse): number {
    const stats = response.data.attributes.last_analysis_stats
    if (!stats) return 0

    const total = stats.malicious + stats.suspicious + stats.harmless + stats.undetected
    if (total === 0) return 0

    return Math.round(((stats.malicious + stats.suspicious) / total) * 100)
  }

  /**
   * Get reputation score
   * @param response - VirusTotal API response
   * @returns Reputation score
   */
  getReputation(response: VirusTotalResponse): number {
    return response.data.attributes.reputation || 0
  }
}

// Create singleton instance
let vtClient: VirusTotalClient | null = null

/**
 * Get VirusTotal client instance
 */
export function getVirusTotalClient(): VirusTotalClient {
  if (!vtClient) {
    vtClient = new VirusTotalClient()
  }
  return vtClient
}

/* ------------------------------------------------------------------ */
/*  Convenience Functions                                              */
/* ------------------------------------------------------------------ */

/**
 * Analyze an IP address
 * @param ip - IP address to analyze
 * @returns Analysis result with summary
 */
export async function analyzeIpAddress(ip: string): Promise<{
  ip: string
  malicious: boolean
  detectionPercentage: number
  reputation: number
  country?: string
  asn?: number
  asOwner?: string
  tags?: string[]
  raw: VirusTotalResponse
}> {
  const client = getVirusTotalClient()
  const response = await client.getIpAddress(ip)

  return {
    ip,
    malicious: client.isMalicious(response),
    detectionPercentage: client.getDetectionPercentage(response),
    reputation: client.getReputation(response),
    country: response.data.attributes.country,
    asn: response.data.attributes.asn,
    asOwner: response.data.attributes.as_owner,
    tags: response.data.attributes.tags,
    raw: response,
  }
}

/**
 * Analyze a domain
 * @param domain - Domain to analyze
 * @returns Analysis result with summary
 */
export async function analyzeDomain(domain: string): Promise<{
  domain: string
  malicious: boolean
  detectionPercentage: number
  reputation: number
  lastAnalysisStats?: VirusTotalAttributes['last_analysis_stats']
  categories?: Record<string, string>
  tags?: string[]
  raw: VirusTotalResponse
}> {
  const client = getVirusTotalClient()
  const response = await client.getDomain(domain)

  return {
    domain,
    malicious: client.isMalicious(response),
    detectionPercentage: client.getDetectionPercentage(response),
    reputation: client.getReputation(response),
    lastAnalysisStats: response.data.attributes.last_analysis_stats,
    categories: response.data.attributes.categories,
    tags: response.data.attributes.tags,
    raw: response,
  }
}

/**
 * Analyze a URL
 * @param url - URL to analyze
 * @returns Analysis result with summary
 */
export async function analyzeUrl(url: string): Promise<{
  url: string
  malicious: boolean
  detectionPercentage: number
  reputation: number
  categories?: Record<string, string>
  tags?: string[]
  raw: VirusTotalResponse
}> {
  const client = getVirusTotalClient()
  const response = await client.getUrl(url)

  return {
    url,
    malicious: client.isMalicious(response),
    detectionPercentage: client.getDetectionPercentage(response),
    reputation: client.getReputation(response),
    categories: response.data.attributes.categories,
    tags: response.data.attributes.tags,
    raw: response,
  }
}

/**
 * Analyze a file hash
 * @param hash - File hash to analyze
 * @returns Analysis result with summary
 */
export async function analyzeFileHash(hash: string): Promise<{
  hash: string
  malicious: boolean
  detectionPercentage: number
  reputation: number
  lastAnalysisStats?: VirusTotalAttributes['last_analysis_stats']
  tags?: string[]
  raw: VirusTotalResponse
}> {
  const client = getVirusTotalClient()
  const response = await client.getFile(hash)

  return {
    hash,
    malicious: client.isMalicious(response),
    detectionPercentage: client.getDetectionPercentage(response),
    reputation: client.getReputation(response),
    lastAnalysisStats: response.data.attributes.last_analysis_stats,
    tags: response.data.attributes.tags,
    raw: response,
  }
}
