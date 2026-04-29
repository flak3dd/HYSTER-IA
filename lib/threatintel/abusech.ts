import { z } from 'zod'
import { httpGet } from '../infrastructure/http-client'
import { CACHE_TTL } from '../infrastructure/cache'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const AbuseChFeedType = z.enum([
  'malwarebazaar',
  'urlhaus',
  'threatfox',
])
export type AbuseChFeedType = z.infer<typeof AbuseChFeedType>

export interface MalwareBazaarSample {
  md5_hash: string
  sha256_hash: string
  sha1_hash: string
  signature: string
  reporter: string
  file_name: string
  file_type: string
  first_seen: string
  last_seen: string
  tags: string[]
  intelligence: {
    mail: string[]
    url: string[]
    domain: string[]
    ip: string[]
  }
}

export interface UrlhausUrl {
  id: string
  url: string
  url_status: string
  threat: string
  tags: string[]
  first_seen: string
  last_seen: string
  urlhaus_link: string
  reporter: string
}

export interface ThreatFoxIndicator {
  ioc: string
  threat_type: string
  threat_type_desc: string
  malware: string
  malware_printable: string
  ioc_type: string
  ioc_type_desc: string
  tags: string[]
  first_seen: string
  last_seen: string
  malware_alias: string[]
  reference: string[]
  reporter: string
  comment: string
}

interface AbuseChListResponse<T> {
  data?: T[]
}

/* ------------------------------------------------------------------ */
/*  Abuse.ch Feed Client                                              */
/* ------------------------------------------------------------------ */

class AbuseChClient {
  private baseUrl = 'https://feed.abuse.ch'

  /**
   * Generic GET request to Abuse.ch feeds
   */
  private async get<T>(endpoint: string, useCache = true): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await httpGet<T>(url, {
      rateLimitCategory: 'threatIntel',
      useCache,
      cacheTtl: CACHE_TTL.threatIntel,
    })

    return response.data
  }

  /* ------------------------------------------------------------------ */
  /*  MalwareBazaar                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Get recent malware samples from MalwareBazaar
   * @param limit - Number of samples to retrieve (max 100)
   * @returns Array of malware samples
   */
  async getMalwareBazaarRecent(limit: number = 50): Promise<MalwareBazaarSample[]> {
    const data = await this.get<AbuseChListResponse<MalwareBazaarSample>>('/mblock.php', false)
    
    if (!data || !data.data) {
      return []
    }

    return data.data.slice(0, limit)
  }

  /**
   * Query MalwareBazaar by file hash
   * @param hash - File hash (MD5, SHA1, or SHA256)
   * @returns Malware sample information
   */
  async queryMalwareBazaarByHash(hash: string): Promise<MalwareBazaarSample[]> {
    const formData = new URLSearchParams()
    
    // Determine hash type
    if (hash.length === 32) {
      formData.append('md5_hash', hash)
    } else if (hash.length === 40) {
      formData.append('sha1_hash', hash)
    } else if (hash.length === 64) {
      formData.append('sha256_hash', hash)
    } else {
      throw new Error('Invalid hash format. Expected MD5, SHA1, or SHA256.')
    }

    const url = `${this.baseUrl}/api/v1/`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`MalwareBazaar query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`MalwareBazaar query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }

  /**
   * Query MalwareBazaar by tag
   * @param tag - Malware tag (e.g., 'emotet', 'trickbot')
   * @param limit - Number of results (max 100)
   * @returns Array of malware samples
   */
  async queryMalwareBazaarByTag(tag: string, limit: number = 50): Promise<MalwareBazaarSample[]> {
    const formData = new URLSearchParams()
    formData.append('query', 'get_taginfo')
    formData.append('tag', tag)
    formData.append('limit', limit.toString())

    const url = `${this.baseUrl}/api/v1/`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`MalwareBazaar query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`MalwareBazaar query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }

  /* ------------------------------------------------------------------ */
  /*  URLhaus                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Get recent malicious URLs from URLhaus
   * @param limit - Number of URLs to retrieve (max 100)
   * @returns Array of malicious URLs
   */
  async getUrlhausRecent(limit: number = 50): Promise<UrlhausUrl[]> {
    const data = await this.get<AbuseChListResponse<UrlhausUrl>>('/csv/urls/recent/', false)
    
    if (!data || !data.data) {
      return []
    }

    return data.data.slice(0, limit)
  }

  /**
   * Query URLhaus by URL
   * @param url - URL to query
   * @returns URL information
   */
  async queryUrlhausByUrl(url: string): Promise<UrlhausUrl[]> {
    const formData = new URLSearchParams()
    formData.append('url', url)

    const apiUrl = `${this.baseUrl}/api/v1/`
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`URLhaus query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`URLhaus query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }

  /**
   * Query URLhaus by host
   * @param host - Host to query
   * @returns Array of URLs for the host
   */
  async queryUrlhausByHost(host: string): Promise<UrlhausUrl[]> {
    const formData = new URLSearchParams()
    formData.append('host', host)

    const apiUrl = `${this.baseUrl}/api/v1/`
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`URLhaus query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`URLhaus query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }

  /* ------------------------------------------------------------------ */
  /*  ThreatFox                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Get recent IOCs from ThreatFox
   * @param limit - Number of IOCs to retrieve (max 100)
   * @returns Array of threat indicators
   */
  async getThreatFoxRecent(limit: number = 50): Promise<ThreatFoxIndicator[]> {
    const formData = new URLSearchParams()
    formData.append('query', 'get_iocs')
    formData.append('limit', limit.toString())

    const url = `${this.baseUrl}/api/v1/`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`ThreatFox query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`ThreatFox query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }

  /**
   * Query ThreatFox by IOC
   * @param ioc - Indicator of compromise
   * @returns Threat indicator information
   */
  async queryThreatFoxByIoc(ioc: string): Promise<ThreatFoxIndicator[]> {
    const formData = new URLSearchParams()
    formData.append('query', 'search_ioc')
    formData.append('search_term', ioc)

    const url = `${this.baseUrl}/api/v1/`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`ThreatFox query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`ThreatFox query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }

  /**
   * Query ThreatFox by malware family
   * @param malware - Malware family name
   * @param limit - Number of results (max 100)
   * @returns Array of threat indicators
   */
  async queryThreatFoxByMalware(malware: string, limit: number = 50): Promise<ThreatFoxIndicator[]> {
    const formData = new URLSearchParams()
    formData.append('query', 'search_malware')
    formData.append('malware', malware)
    formData.append('limit', limit.toString())

    const url = `${this.baseUrl}/api/v1/`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      throw new Error(`ThreatFox query failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.query_status === 'no_results') {
      return []
    }

    if (data.query_status !== 'ok') {
      throw new Error(`ThreatFox query error: ${data.query_status}`)
    }

    return Array.isArray(data.data) ? data.data : [data.data]
  }
}

// Create singleton instance
let abuseChClient: AbuseChClient | null = null

/**
 * Get Abuse.ch client instance
 */
export function getAbuseChClient(): AbuseChClient {
  if (!abuseChClient) {
    abuseChClient = new AbuseChClient()
  }
  return abuseChClient
}

/* ------------------------------------------------------------------ */
/*  Convenience Functions                                              */
/* ------------------------------------------------------------------ */

/**
 * Check if a file hash is malicious according to MalwareBazaar
 * @param hash - File hash to check
 * @returns True if malicious
 */
export async function checkMalwareBazaarHash(hash: string): Promise<{
  malicious: boolean
  samples: MalwareBazaarSample[]
}> {
  const client = getAbuseChClient()
  const samples = await client.queryMalwareBazaarByHash(hash)
  
  return {
    malicious: samples.length > 0,
    samples,
  }
}

/**
 * Check if a URL is malicious according to URLhaus
 * @param url - URL to check
 * @returns True if malicious
 */
export async function checkUrlhausUrl(url: string): Promise<{
  malicious: boolean
  urls: UrlhausUrl[]
}> {
  const client = getAbuseChClient()
  const urls = await client.queryUrlhausByUrl(url)
  
  return {
    malicious: urls.length > 0,
    urls,
  }
}

/**
 * Check if an IOC is known according to ThreatFox
 * @param ioc - Indicator of compromise
 * @returns True if known threat
 */
export async function checkThreatFoxIoc(ioc: string): Promise<{
  threat: boolean
  indicators: ThreatFoxIndicator[]
}> {
  const client = getAbuseChClient()
  const indicators = await client.queryThreatFoxByIoc(ioc)
  
  return {
    threat: indicators.length > 0,
    indicators,
  }
}
