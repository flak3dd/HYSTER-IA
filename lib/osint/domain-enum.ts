import { z } from 'zod'
import { httpGet } from '../infrastructure/http-client'
import { CACHE_TTL } from '../infrastructure/cache'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const SubdomainSource = z.enum(['crtsh', 'dns', 'wildcard'])
export type SubdomainSource = z.infer<typeof SubdomainSource>

export const DnsRecordType = z.enum(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'])
export type DnsRecordType = z.infer<typeof DnsRecordType>

export interface DnsRecord {
  type: string
  name: string
  value: string
  ttl?: number
}

export interface SubdomainResult {
  domain: string
  subdomains: string[]
  source: SubdomainSource
  timestamp: number
}

export interface WhoisResult {
  domain: string
  registrar?: string
  createdDate?: string
  expiryDate?: string
  status?: string[]
  nameServers?: string[]
  registrant?: {
    name?: string
    organization?: string
    email?: string
  }
  raw?: string
}

export interface DomainEnumResult {
  domain: string
  subdomains: SubdomainResult[]
  dnsRecords: DnsRecord[]
  whois?: WhoisResult
  timestamp: number
}

interface CrtShCertificate {
  name_value?: string
}

interface GoogleDnsAnswer {
  name: string
  data: string
  TTL?: number
}

interface GoogleDnsResponse {
  Answer?: GoogleDnsAnswer[]
}

export interface DomainEnumerationOptions {
  includeCrtSh?: boolean
  includeDnsEnum?: boolean
  includeWildcardCheck?: boolean
  includeWhois?: boolean
  includeBruteForce?: boolean
  bruteForceWordlist?: string[]
}

/* ------------------------------------------------------------------ */
/*  crt.sh Integration (Certificate Transparency)                      */
/* ------------------------------------------------------------------ */

/**
 * Fetch subdomains from crt.sh (Certificate Transparency log)
 * @param domain - Domain to search for
 * @returns Array of subdomains
 */
export async function getSubdomainsFromCrtSh(domain: string): Promise<string[]> {
  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`
    const response = await httpGet<CrtShCertificate[]>(url, {
      rateLimitCategory: 'dns',
      useCache: true,
      cacheTtl: CACHE_TTL.subdomains,
    })

    if (!response.data) {
      return []
    }

    // Extract unique subdomains from certificate names
    const subdomains = new Set<string>()
    
    for (const cert of response.data) {
      const names = cert.name_value?.split('\n') || []
      for (const name of names) {
        const cleaned = name.trim().toLowerCase()
        // Skip wildcards and exact domain match
        if (!cleaned.startsWith('*.') && cleaned !== domain) {
          subdomains.add(cleaned)
        }
      }
    }

    return Array.from(subdomains).sort()
  } catch (error) {
    console.error('Error fetching from crt.sh:', error)
    throw new Error(`Failed to fetch subdomains from crt.sh: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/* ------------------------------------------------------------------ */
/*  DNS Enumeration                                                   */
/* ------------------------------------------------------------------ */

/**
 * Perform DNS enumeration for a domain
 * @param domain - Domain to enumerate
 * @param recordTypes - DNS record types to query (default: common ones)
 * @returns Array of DNS records
 */
export async function enumerateDnsRecords(
  domain: string,
  recordTypes: DnsRecordType[] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME']
): Promise<DnsRecord[]> {
  const results: DnsRecord[] = []

  for (const recordType of recordTypes) {
    try {
      const records = await queryDnsRecord(domain, recordType)
      results.push(...records)
    } catch (error) {
      // Continue with other record types even if one fails
      console.warn(`Failed to query ${recordType} record for ${domain}:`, error)
    }
  }

  return results
}

/**
 * Query specific DNS record type
 * @param domain - Domain to query
 * @param recordType - DNS record type
 * @returns Array of DNS records
 */
async function queryDnsRecord(domain: string, recordType: DnsRecordType): Promise<DnsRecord[]> {
  try {
    // Use Google DNS API for DNS resolution
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${recordType}`
    const response = await httpGet<GoogleDnsResponse>(url, {
      rateLimitCategory: 'dns',
      useCache: true,
      cacheTtl: CACHE_TTL.dns,
    })

    if (!response.data || !response.data.Answer) {
      return []
    }

    return response.data.Answer.map((answer) => ({
      type: recordType,
      name: answer.name,
      value: answer.data,
      ttl: answer.TTL,
    }))
  } catch (error) {
    console.error(`Error querying ${recordType} record for ${domain}:`, error)
    return []
  }
}

/**
 * Check for wildcard DNS records
 * @param domain - Domain to check
 * @returns True if wildcard DNS is detected
 */
export async function checkWildcardDns(domain: string): Promise<boolean> {
  try {
    // Query a random subdomain that likely doesn't exist
    const randomSubdomain = `nonexistent-${Date.now()}.${domain}`
    const records = await queryDnsRecord(randomSubdomain, 'A')
    
    // If we get records for a non-existent subdomain, it's a wildcard
    return records.length > 0
  } catch {
    return false
  }
}

/**
 * Enumerate subdomains using DNS brute force
 * @param domain - Domain to enumerate
 * @param wordlist - List of subdomain prefixes to try
 * @returns Array of discovered subdomains
 */
export async function bruteForceSubdomains(
  domain: string,
  wordlist: string[] = DEFAULT_WORDLIST
): Promise<string[]> {
  const discovered: string[] = []

  // Process in batches to avoid overwhelming DNS servers
  const batchSize = 10
  for (let i = 0; i < wordlist.length; i += batchSize) {
    const batch = wordlist.slice(i, i + batchSize)
    
    const promises = batch.map(async (prefix) => {
      const subdomain = `${prefix}.${domain}`
      try {
        const records = await queryDnsRecord(subdomain, 'A')
        if (records.length > 0) {
          return subdomain
        }
      } catch {
        // Subdomain doesn't exist
      }
      return null
    })

    const results = await Promise.all(promises)
    discovered.push(...results.filter((r): r is string => r !== null))

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return discovered.sort()
}

// Default wordlist for subdomain brute force
const DEFAULT_WORDLIST = [
  'www', 'mail', 'ftp', 'admin', 'blog', 'api', 'dev', 'staging', 'test',
  'app', 'portal', 'secure', 'vpn', 'remote', 'email', 'smtp', 'pop', 'imap',
  'ns1', 'ns2', 'dns', 'mx', 'cdn', 'static', 'assets', 'img', 'images',
  'video', 'media', 'docs', 'files', 'download', 'upload', 'cloud', 'storage',
  'db', 'database', 'mysql', 'postgres', 'mongo', 'redis', 'elastic', 'search',
  'auth', 'login', 'sso', 'oauth', 'identity', 'accounts', 'users', 'members',
  'shop', 'store', 'cart', 'checkout', 'payment', 'billing', 'invoice',
  'support', 'help', 'faq', 'docs', 'wiki', 'knowledge', 'training',
  'news', 'blog', 'forum', 'community', 'social', 'chat', 'messages',
  'mobile', 'm', 'wap', 'touch', 'app', 'apps', 'api', 'webhook', 'webhooks',
  'internal', 'intranet', 'extranet', 'partner', 'partners', 'affiliate',
  'marketing', 'sales', 'crm', 'erp', 'hr', 'finance', 'accounting',
  'jenkins', 'ci', 'cd', 'build', 'deploy', 'release', 'git', 'svn',
  'monitor', 'metrics', 'logs', 'logging', 'analytics', 'stats', 'statistics',
  'dashboard', 'report', 'reports', 'admin', 'administrator', 'root',
  'staging', 'production', 'prod', 'dev', 'development', 'qa', 'testing',
  'demo', 'sandbox', 'lab', 'experimental', 'beta', 'alpha'
]

/* ------------------------------------------------------------------ */
/*  WHOIS Lookup                                                      */
/* ------------------------------------------------------------------ */

/**
 * Perform WHOIS lookup for a domain
 * @param domain - Domain to lookup
 * @returns WHOIS information
 */
export async function whoisLookup(domain: string): Promise<WhoisResult> {
  try {
    // Use whois.js library for WHOIS lookup
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const whois = require('whois')
    
    return new Promise((resolve, reject) => {
      whois.lookup(domain, (err: Error | null, data: string) => {
        if (err) {
          reject(err)
          return
        }

        try {
          const parsed = parseWhoisData(data, domain)
          resolve({
            domain,
            ...parsed,
            raw: data,
          })
        } catch {
          // Return raw data if parsing fails
          resolve({
            domain,
            raw: data,
          })
        }
      })
    })
  } catch (error) {
    console.error('Error performing WHOIS lookup:', error)
    throw new Error(`Failed to perform WHOIS lookup: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Parse WHOIS data
 * @param data - Raw WHOIS data
 * @param domain - Domain name
 * @returns Parsed WHOIS information
 */
function parseWhoisData(data: string, domain: string): Partial<WhoisResult> {
  const result: Partial<WhoisResult> = { domain }
  const lines = data.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('%')) {
      continue
    }

    const [key, ...valueParts] = trimmed.split(':')
    if (valueParts.length === 0) continue

    const value = valueParts.join(':').trim()
    const lowerKey = key.toLowerCase().trim()

    switch (lowerKey) {
      case 'registrar':
      case 'registrar name':
      case 'sponsoring registrar':
        result.registrar = value
        break
      case 'creation date':
      case 'created':
      case 'registered':
      case 'registration time':
        result.createdDate = value
        break
      case 'registry expiry date':
      case 'expiry date':
      case 'expiration date':
      case 'expires':
        result.expiryDate = value
        break
      case 'domain status':
      case 'status':
        if (!result.status) result.status = []
        result.status.push(...value.split(/[\s,]+/).filter(s => s))
        break
      case 'name server':
      case 'nameserver':
      case 'nserver':
        if (!result.nameServers) result.nameServers = []
        result.nameServers.push(...value.split(/[\s,]+/).filter(s => s))
        break
      case 'registrant name':
      case 'registrant':
        if (!result.registrant) result.registrant = {}
        result.registrant.name = value
        break
      case 'registrant organization':
      case 'registrant org':
        if (!result.registrant) result.registrant = {}
        result.registrant.organization = value
        break
      case 'registrant email':
      case 'registrant e-mail':
        if (!result.registrant) result.registrant = {}
        result.registrant.email = value
        break
    }
  }

  return result
}

/* ------------------------------------------------------------------ */
/*  Comprehensive Domain Enumeration                                  */
/* ------------------------------------------------------------------ */

/**
 * Perform comprehensive domain enumeration
 * @param domain - Domain to enumerate
 * @param options - Enumeration options
 * @returns Complete domain enumeration results
 */
export async function enumerateDomain(
  domain: string,
  options: DomainEnumerationOptions = {}
): Promise<DomainEnumResult> {
  const {
    includeCrtSh = true,
    includeDnsEnum = true,
    includeWildcardCheck = true,
    includeWhois = true,
    includeBruteForce = false,
    bruteForceWordlist,
  } = options

  const result: DomainEnumResult = {
    domain,
    subdomains: [],
    dnsRecords: [],
    timestamp: Date.now(),
  }

  // Certificate Transparency subdomain discovery
  if (includeCrtSh) {
    try {
      const crtShSubdomains = await getSubdomainsFromCrtSh(domain)
      result.subdomains.push({
        domain,
        subdomains: crtShSubdomains,
        source: 'crtsh',
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error('Certificate Transparency enumeration failed:', error)
    }
  }

  // DNS brute force
  if (includeBruteForce) {
    try {
      const discoveredSubdomains = await bruteForceSubdomains(
        domain,
        bruteForceWordlist
      )
      result.subdomains.push({
        domain,
        subdomains: discoveredSubdomains,
        source: 'wildcard',
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error('DNS brute force failed:', error)
    }
  }

  // DNS record enumeration for main domain
  if (includeDnsEnum) {
    try {
      result.dnsRecords = await enumerateDnsRecords(domain)
    } catch (error) {
      console.error('DNS enumeration failed:', error)
    }
  }

  // Wildcard DNS check
  if (includeWildcardCheck) {
    try {
      const hasWildcard = await checkWildcardDns(domain)
      if (hasWildcard) {
        console.warn(`Wildcard DNS detected for ${domain}`)
      }
    } catch (error) {
      console.error('Wildcard check failed:', error)
    }
  }

  // WHOIS lookup
  if (includeWhois) {
    try {
      result.whois = await whoisLookup(domain)
    } catch (error) {
      console.error('WHOIS lookup failed:', error)
    }
  }

  // Deduplicate subdomains
  const allSubdomains = new Set<string>()
  result.subdomains.forEach(source => {
    source.subdomains.forEach(sub => allSubdomains.add(sub))
  })

  return result
}

/**
 * Get all unique subdomains from enumeration result
 * @param result - Domain enumeration result
 * @returns Array of unique subdomains
 */
export function getAllSubdomains(result: DomainEnumResult): string[] {
  const subdomains = new Set<string>()
  result.subdomains.forEach(source => {
    source.subdomains.forEach(sub => subdomains.add(sub))
  })
  return Array.from(subdomains).sort()
}
