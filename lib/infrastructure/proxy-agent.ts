import { ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici'
import { SocksProxyAgent } from 'socks-proxy-agent'

// Proxy configuration from environment
const PROXY_URL = process.env.HYSTERIA_EGRESS_PROXY_URL || ''
const USE_PROXY = PROXY_URL.length > 0

/**
 * Create a proxy agent for HTTP/HTTPS requests
 * Routes traffic through the Hysteria2 SOCKS5/HTTP proxy
 */
export function createProxyAgent(): Dispatcher | undefined {
  if (!USE_PROXY) {
    return undefined
  }

  try {
    // Check if it's a SOCKS proxy
    if (PROXY_URL.startsWith('socks')) {
      return new SocksProxyAgent(PROXY_URL) as unknown as Dispatcher
    }
    
    // Otherwise use as HTTP proxy
    return new ProxyAgent(PROXY_URL)
  } catch (error) {
    console.error('Failed to create proxy agent:', error)
    return undefined
  }
}

/**
 * Configure global dispatcher to use proxy for all requests
 */
export function setupGlobalProxy(): void {
  const agent = createProxyAgent()
  if (agent) {
    setGlobalDispatcher(agent)
    console.log(`Global proxy configured: ${PROXY_URL}`)
  }
}

/**
 * Fetch with proxy support
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Fetch response
 */
export async function fetchWithProxy(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const agent = createProxyAgent()
  
  const mergedOptions: RequestInit = {
    ...options,
    // @ts-expect-error - undici supports dispatcher option
    dispatcher: agent,
  }

  return fetch(url, mergedOptions)
}

/**
 * Check if proxy is configured and available
 */
export function isProxyConfigured(): boolean {
  return USE_PROXY
}

/**
 * Get proxy URL (masked for security)
 */
export function getProxyUrl(): string {
  if (!USE_PROXY) return 'Not configured'
  
  // Mask credentials in URL
  try {
    const url = new URL(PROXY_URL)
    if (url.username || url.password) {
      url.username = '***'
      url.password = '***'
    }
    return url.toString()
  } catch {
    return PROXY_URL
  }
}
