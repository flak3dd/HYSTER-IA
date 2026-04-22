import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { z } from "zod"

export const ProtocolType = z.enum([
  "hysteria2",
  "https",
  "dns",
  "websocket",
  "tcp",
  "udp",
  "icmp",
  "http2",
  "quic"
])
export type ProtocolType = z.infer<typeof ProtocolType>

export const AdapterStatus = z.enum([
  "connected",
  "disconnected",
  "connecting",
  "error",
  "reconnecting"
])
export type AdapterStatus = z.infer<typeof AdapterStatus>

export const MessageDirection = z.enum(["outbound", "inbound"])
export type MessageDirection = z.infer<typeof MessageDirection>

export const TransportMessage = z.object({
  id: z.string().min(1),
  direction: MessageDirection,
  payload: z.string(),
  metadata: z.record(z.string(), z.any()).default({}),
  timestamp: z.number().int(),
  encrypted: z.boolean().default(true),
  compressed: z.boolean().default(false),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal")
})
export type TransportMessage = z.infer<typeof TransportMessage>

export const AdapterConfig = z.object({
  type: ProtocolType,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  path: z.string().default("/"),
  timeout: z.number().int().min(1000).default(30000),
  retryAttempts: z.number().int().min(0).default(3),
  retryDelay: z.number().int().min(100).default(1000),
  keepAlive: z.boolean().default(true),
  keepAliveInterval: z.number().int().min(1000).default(30000),
  maxConnections: z.number().int().min(1).max(100).default(5),
  bufferSize: z.number().int().min(1024).default(8192),
  encryption: z.object({
    enabled: z.boolean().default(true),
    algorithm: z.enum(["aes-256-gcm", "chacha20-poly1305"]).default("aes-256-gcm"),
    key: z.string().min(32)
  }).default({ 
    enabled: true,
    algorithm: "aes-256-gcm",
    key: "default-encryption-key-32-chars-long"
  }),
  compression: z.object({
    enabled: z.boolean().default(false),
    algorithm: z.enum(["gzip", "deflate", "brotli"]).default("gzip")
  }).default({ 
    enabled: false,
    algorithm: "gzip"
  }),
  authentication: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(["token", "certificate", "basic"]).default("token"),
    credentials: z.record(z.string(), z.string()).optional()
  }).optional(),
  proxy: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(["http", "socks4", "socks5"]).default("http"),
    host: z.string().optional(),
    port: z.number().int().optional(),
    credentials: z.record(z.string(), z.string()).optional()
  }).optional(),
  customHeaders: z.record(z.string(), z.string()).default({}),
  rateLimit: z.object({
    enabled: z.boolean().default(false),
    requestsPerSecond: z.number().int().min(1).default(10),
    burstSize: z.number().int().min(1).default(20)
  }).optional()
})
export type AdapterConfig = z.infer<typeof AdapterConfig>

export interface ConnectionMetrics {
  id: string
  adapterType: ProtocolType
  status: AdapterStatus
  connectedAt: number
  lastActivity: number
  bytesSent: number
  bytesReceived: number
  messagesSent: number
  messagesReceived: number
  connectionErrors: number
  averageLatency: number
  uptime: number
}

export abstract class TransportAdapter extends EventEmitter {
  protected config: AdapterConfig
  protected status: AdapterStatus = "disconnected"
  protected metrics: ConnectionMetrics
  protected connections: Map<string, any> = new Map()
  protected messageQueue: TransportMessage[] = []
  protected rateLimiter?: RateLimiter

  constructor(config: AdapterConfig) {
    super()
    this.config = config
    this.metrics = this.initializeMetrics()
    
    if (config.rateLimit?.enabled) {
      this.rateLimiter = new RateLimiter(config.rateLimit)
    }
  }

  /**
   * Initialize connection metrics
   */
  private initializeMetrics(): ConnectionMetrics {
    return {
      id: randomUUID(),
      adapterType: this.config.type,
      status: "disconnected",
      connectedAt: 0,
      lastActivity: 0,
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      connectionErrors: 0,
      averageLatency: 0,
      uptime: 0
    }
  }

  /**
   * Connect to the transport
   */
  abstract connect(): Promise<void>

  /**
   * Disconnect from the transport
   */
  abstract disconnect(): Promise<void>

  /**
   * Send a message
   */
  async sendMessage(message: TransportMessage): Promise<void> {
    if (this.status !== "connected") {
      throw new Error(`Adapter not connected: ${this.status}`)
    }

    // Check rate limit
    if (this.rateLimiter && !await this.rateLimiter.checkLimit()) {
      throw new Error("Rate limit exceeded")
    }

    // Process message
    const processedMessage = await this.processOutboundMessage(message)
    
    try {
      await this.sendData(processedMessage)
      this.updateMetrics("sent", processedMessage)
      this.emit("messageSent", processedMessage)
    } catch (error) {
      this.metrics.connectionErrors++
      this.emit("sendError", { message, error })
      throw error
    }
  }

  /**
   * Process outbound message
   */
  protected async processOutboundMessage(message: TransportMessage): Promise<TransportMessage> {
    let processed = { ...message }

    // Apply compression
    if (this.config.compression.enabled && !message.compressed) {
      processed.payload = await this.compressData(processed.payload)
      processed.compressed = true
    }

    // Apply encryption
    if (this.config.encryption.enabled && !message.encrypted) {
      processed.payload = await this.encryptData(processed.payload)
      processed.encrypted = true
    }

    return processed
  }

  /**
   * Process inbound message
   */
  protected async processInboundMessage(message: TransportMessage): Promise<TransportMessage> {
    let processed = { ...message }

    // Apply decryption
    if (this.config.encryption.enabled && message.encrypted) {
      processed.payload = await this.decryptData(processed.payload)
      processed.encrypted = false
    }

    // Apply decompression
    if (this.config.compression.enabled && message.compressed) {
      processed.payload = await this.decompressData(processed.payload)
      processed.compressed = false
    }

    return processed
  }

  /**
   * Send data (implementation specific)
   */
  protected abstract sendData(message: TransportMessage): Promise<void>

  /**
   * Handle received data
   */
  protected async handleReceivedData(rawData: string): Promise<void> {
    try {
      const message = JSON.parse(rawData) as TransportMessage
      const processedMessage = await this.processInboundMessage(message)
      
      this.updateMetrics("received", processedMessage)
      this.emit("messageReceived", processedMessage)
    } catch (error) {
      this.metrics.connectionErrors++
      this.emit("receiveError", { rawData, error })
    }
  }

  /**
   * Update connection metrics
   */
  private updateMetrics(type: "sent" | "received", message: TransportMessage): void {
    this.metrics.lastActivity = Date.now()
    
    if (type === "sent") {
      this.metrics.messagesSent++
      this.metrics.bytesSent += message.payload.length
    } else {
      this.metrics.messagesReceived++
      this.metrics.bytesReceived += message.payload.length
    }

    // Update uptime
    if (this.status === "connected") {
      this.metrics.uptime = Date.now() - this.metrics.connectedAt
    }
  }

  /**
   * Compress data
   */
  protected async compressData(data: string): Promise<string> {
    // Implementation would use zlib or similar
    return data // Placeholder
  }

  /**
   * Decompress data
   */
  protected async decompressData(data: string): Promise<string> {
    // Implementation would use zlib or similar
    return data // Placeholder
  }

  /**
   * Encrypt data
   */
  protected async encryptData(data: string): Promise<string> {
    // Implementation would use crypto module
    return data // Placeholder
  }

  /**
   * Decrypt data
   */
  protected async decryptData(data: string): Promise<string> {
    // Implementation would use crypto module
    return data // Placeholder
  }

  /**
   * Get connection status
   */
  getStatus(): AdapterStatus {
    return this.status
  }

  /**
   * Get metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AdapterConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/**
 * Hysteria2 Transport Adapter
 */
export class Hysteria2Adapter extends TransportAdapter {
  private client?: any

  async connect(): Promise<void> {
    this.status = "connecting"
    
    try {
      // Hysteria2 client implementation would go here
      this.status = "connected"
      this.metrics.connectedAt = Date.now()
      this.metrics.status = "connected"
      
      this.emit("connected")
    } catch (error) {
      this.status = "error"
      this.metrics.connectionErrors++
      this.emit("error", error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // Close Hysteria2 connection
      this.client = undefined
    }
    
    this.status = "disconnected"
    this.metrics.status = "disconnected"
    this.emit("disconnected")
  }

  protected async sendData(message: TransportMessage): Promise<void> {
    if (!this.client) {
      throw new Error("Hysteria2 client not connected")
    }

    const url = `https://${this.config.host}:${this.config.port}${this.config.path}`
    
    // Send via Hysteria2 protocol
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...this.config.customHeaders
      },
      body: message.payload
    })

    if (!response.ok) {
      throw new Error(`Hysteria2 request failed: ${response.status}`)
    }
  }
}

/**
 * HTTPS Transport Adapter
 */
export class HTTPSAdapter extends TransportAdapter {
  private httpClient?: any

  async connect(): Promise<void> {
    this.status = "connecting"
    
    try {
      // Test connectivity
      const response = await fetch(`https://${this.config.host}:${this.config.port}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`)
      }

      this.status = "connected"
      this.metrics.connectedAt = Date.now()
      this.metrics.status = "connected"
      
      this.emit("connected")
    } catch (error) {
      this.status = "error"
      this.metrics.connectionErrors++
      this.emit("error", error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected"
    this.metrics.status = "disconnected"
    this.emit("disconnected")
  }

  protected async sendData(message: TransportMessage): Promise<void> {
    const url = `https://${this.config.host}:${this.config.port}${this.config.path}`
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.customHeaders
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.config.timeout)
    })

    if (!response.ok) {
      throw new Error(`HTTPS request failed: ${response.status}`)
    }
  }
}

/**
 * DNS Transport Adapter
 */
export class DNSAdapter extends TransportAdapter {
  private resolver?: any

  async connect(): Promise<void> {
    this.status = "connecting"
    
    try {
      // Initialize DNS resolver
      this.status = "connected"
      this.metrics.connectedAt = Date.now()
      this.metrics.status = "connected"
      
      this.emit("connected")
    } catch (error) {
      this.status = "error"
      this.metrics.connectionErrors++
      this.emit("error", error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected"
    this.metrics.status = "disconnected"
    this.emit("disconnected")
  }

  protected async sendData(message: TransportMessage): Promise<void> {
    // DNS tunneling implementation
    const encoded = Buffer.from(message.payload).toString('base64').replace(/=/g, '')
    const subdomain = `${encoded}.${this.config.host}`
    
    // Send DNS query
    // This would use a DNS library to send the query
    console.log(`DNS query: ${subdomain}`)
  }
}

/**
 * WebSocket Transport Adapter
 */
export class WebSocketAdapter extends TransportAdapter {
  private ws?: any

  async connect(): Promise<void> {
    this.status = "connecting"
    
    try {
      const url = `wss://${this.config.host}:${this.config.port}${this.config.path}`
      
      // WebSocket implementation would go here
      this.status = "connected"
      this.metrics.connectedAt = Date.now()
      this.metrics.status = "connected"
      
      this.emit("connected")
    } catch (error) {
      this.status = "error"
      this.metrics.connectionErrors++
      this.emit("error", error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }
    
    this.status = "disconnected"
    this.metrics.status = "disconnected"
    this.emit("disconnected")
  }

  protected async sendData(message: TransportMessage): Promise<void> {
    if (!this.ws) {
      throw new Error("WebSocket not connected")
    }

    this.ws.send(JSON.stringify(message))
  }
}

/**
 * Rate Limiter
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private config: AdapterConfig["rateLimit"]

  constructor(config: AdapterConfig["rateLimit"]) {
    this.config = config!
    this.tokens = config!.burstSize
    this.lastRefill = Date.now()
  }

  async checkLimit(): Promise<boolean> {
    const now = Date.now()
    const timePassed = now - this.lastRefill
    const tokensToAdd = (timePassed / 1000) * this.config!.requestsPerSecond

    this.tokens = Math.min(this.config!.burstSize, this.tokens + tokensToAdd)
    this.lastRefill = now

    if (this.tokens >= 1) {
      this.tokens--
      return true
    }

    return false
  }
}

/**
 * Adapter Factory
 */
export class TransportAdapterFactory {
  private static adapters = new Map<ProtocolType, typeof TransportAdapter>([
    ["hysteria2", Hysteria2Adapter],
    ["https", HTTPSAdapter],
    ["dns", DNSAdapter],
    ["websocket", WebSocketAdapter]
  ])

  static createAdapter(config: AdapterConfig): TransportAdapter {
    switch (config.type) {
      case "hysteria2":
        return new Hysteria2Adapter(config)
      case "https":
        return new HTTPSAdapter(config)
      case "dns":
        return new DNSAdapter(config)
      case "websocket":
        return new WebSocketAdapter(config)
      default:
        throw new Error(`Unsupported transport type: ${config.type}`)
    }
  }

  static registerAdapter(type: ProtocolType, adapterClass: typeof TransportAdapter): void {
    this.adapters.set(type, adapterClass)
  }

  static getSupportedTypes(): ProtocolType[] {
    return Array.from(this.adapters.keys())
  }
}

/**
 * Adapter Manager
 */
export class TransportAdapterManager extends EventEmitter {
  private adapters: Map<string, TransportAdapter> = new Map()
  private defaultAdapter?: string

  /**
   * Add an adapter
   */
  addAdapter(id: string, adapter: TransportAdapter): void {
    this.adapters.set(id, adapter)
    
    adapter.on("connected", () => {
      this.emit("adapterConnected", id)
    })

    adapter.on("disconnected", () => {
      this.emit("adapterDisconnected", id)
    })

    adapter.on("messageReceived", (message) => {
      this.emit("messageReceived", { adapterId: id, message })
    })

    adapter.on("error", (error) => {
      this.emit("adapterError", { adapterId: id, error })
    })
  }

  /**
   * Remove an adapter
   */
  async removeAdapter(id: string): Promise<void> {
    const adapter = this.adapters.get(id)
    if (adapter) {
      await adapter.disconnect()
      this.adapters.delete(id)
    }
  }

  /**
   * Get adapter by ID
   */
  getAdapter(id: string): TransportAdapter | undefined {
    return this.adapters.get(id)
  }

  /**
   * Get all adapters
   */
  getAllAdapters(): Map<string, TransportAdapter> {
    return new Map(this.adapters)
  }

  /**
   * Set default adapter
   */
  setDefaultAdapter(id: string): void {
    if (this.adapters.has(id)) {
      this.defaultAdapter = id
    }
  }

  /**
   * Send message via default or specific adapter
   */
  async sendMessage(message: TransportMessage, adapterId?: string): Promise<void> {
    const targetAdapterId = adapterId || this.defaultAdapter
    if (!targetAdapterId) {
      throw new Error("No adapter specified and no default adapter set")
    }

    const adapter = this.adapters.get(targetAdapterId)
    if (!adapter) {
      throw new Error(`Adapter not found: ${targetAdapterId}`)
    }

    await adapter.sendMessage(message)
  }

  /**
   * Connect all adapters
   */
  async connectAll(): Promise<void> {
    const connectPromises = Array.from(this.adapters.values()).map(adapter => 
      adapter.connect().catch(error => {
        console.error("Failed to connect adapter:", error)
      })
    )

    await Promise.all(connectPromises)
  }

  /**
   * Disconnect all adapters
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.adapters.values()).map(adapter => 
      adapter.disconnect().catch(error => {
        console.error("Failed to disconnect adapter:", error)
      })
    )

    await Promise.all(disconnectPromises)
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): ConnectionMetrics[] {
    return Array.from(this.adapters.values()).map(adapter => adapter.getMetrics())
  }
}