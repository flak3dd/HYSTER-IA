/**
 * Mock server utilities for testing
 * Provides mock implementations of external services and APIs
 */

import { Server } from 'http'
import { AddressInfo } from 'net'

export interface MockServerConfig {
  port?: number
  routes: Record<string, (req: any, res: any) => void>
}

/**
 * Simple HTTP mock server for testing
 */
export class MockServer {
  private server: Server | null = null
  private port: number
  private routes: Map<string, (req: any, res: any) => void>

  constructor(config: MockServerConfig) {
    this.port = config.port || 0 // 0 means random available port
    this.routes = new Map()
    Object.entries(config.routes).forEach(([path, handler]) => {
      this.routes.set(path, handler)
    })
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const http = require('http')

      this.server = http.createServer((req: any, res: any) => {
        const path = req.url
        const handler = this.routes.get(path)

        if (handler) {
          handler(req, res)
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Not found' }))
        }
      })

      this.server!.listen(this.port)
      this.server!.on('error', (err: Error) => {
        reject(err)
      })
      this.server!.on('listening', () => {
        const address = this.server?.address() as AddressInfo
        resolve(address.port)
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close()
        this.server.on('error', (err: Error) => {
          reject(err)
        })
        this.server.on('close', () => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  getPort(): number {
    return this.port
  }
}

/**
 * Mock SMTP server for email testing
 */
export class MockSMTPServer {
  private server: any
  private port: number
  private receivedEmails: any[] = []

  constructor(port: number = 2525) {
    this.port = port
  }

  async start(): Promise<void> {
    const { SMTPServer } = require('smtp-server')

    this.server = new SMTPServer({
      authOptional: true,
      onData: (stream: any, session: any, callback: any) => {
        let message = ''
        stream.on('data', (chunk: Buffer) => {
          message += chunk.toString()
        })
        stream.on('end', () => {
          this.receivedEmails.push({
            from: session.envelope.mailFrom,
            to: session.envelope.rcptTo,
            message,
            timestamp: new Date(),
          })
          callback()
        })
      },
    })

    await new Promise((resolve, reject) => {
      this.server!.listen(this.port, (err: Error) => {
        if (err) reject(err)
        else resolve(undefined)
      })
    })
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => {
      this.server.close(resolve)
    })
  }

  getReceivedEmails(): any[] {
    return this.receivedEmails
  }

  clearEmails(): void {
    this.receivedEmails = []
  }
}

/**
 * Mock WebSocket server for testing real-time features
 */
export class MockWebSocketServer {
  private server: any
  private port: number
  private clients: any[] = []

  constructor(port: number = 8080) {
    this.port = port
  }

  async start(): Promise<void> {
    const { WebSocketServer } = require('ws')

    this.server = new WebSocketServer({ port: this.port })

    this.server.on('connection', (ws: any) => {
      this.clients.push(ws)

      ws.on('message', (message: string) => {
        // Echo back for testing
        ws.send(JSON.stringify({ type: 'echo', data: message }))
      })

      ws.on('close', () => {
        this.clients = this.clients.filter(c => c !== ws)
      })
    })
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => {
      this.server.close(resolve)
    })
  }

  broadcast(message: any): void {
    this.clients.forEach(client => {
      client.send(JSON.stringify(message))
    })
  }

  getClientCount(): number {
    return this.clients.length
  }
}

/**
 * Mock external API services
 */
export class MockExternalAPIs {
  private mockResponses: Map<string, any>

  constructor() {
    this.mockResponses = new Map()
  }

  setMockResponse(endpoint: string, response: any): void {
    this.mockResponses.set(endpoint, response)
  }

  getMockResponse(endpoint: string): any {
    return this.mockResponses.get(endpoint)
  }

  /**
   * Mock VirusTotal API
   */
  mockVirusTotal(fileHash: string, result: any): void {
    this.setMockResponse(`/virustotal/${fileHash}`, result)
  }

  /**
   * Mock AlienVault OTX API
   */
  mockAlienVault(indicator: string, result: any): void {
    this.setMockResponse(`/alienvault/${indicator}`, result)
  }

  /**
   * Mock AbuseIPDB API
   */
  mockAbuseIPDB(ip: string, result: any): void {
    this.setMockResponse(`/abuseipdb/${ip}`, result)
  }

  /**
   * Mock WHOIS lookup
   */
  mockWhois(domain: string, result: any): void {
    this.setMockResponse(`/whois/${domain}`, result)
  }

  /**
   * Mock DNS resolution
   */
  mockDNS(domain: string, result: any): void {
    this.setMockResponse(`/dns/${domain}`, result)
  }

  /**
   * Mock OpenAI API for AI features
   */
  mockOpenAI(prompt: string, response: any): void {
    this.setMockResponse(`/openai/chat`, response)
  }
}

/**
 * Mock Hysteria2 server for C2 testing
 */
export class MockHysteria2Server {
  private server: any
  private port: number
  private connections: any[] = []
  private authTokens: Set<string>

  constructor(port: number = 443, authTokens: string[] = []) {
    this.port = port
    this.authTokens = new Set(authTokens)
  }

  async start(): Promise<void> {
    // Mock Hysteria2 server implementation
    // In a real implementation, this would start a Hysteria2 server
    this.server = {
      listen: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    }
  }

  async stop(): Promise<void> {
    if (this.server && this.server.close) {
      this.server.close()
    }
  }

  addAuthToken(token: string): void {
    this.authTokens.add(token)
  }

  removeAuthToken(token: string): void {
    this.authTokens.delete(token)
  }

  validateAuthToken(token: string): boolean {
    return this.authTokens.has(token)
  }

  getConnectionCount(): number {
    return this.connections.length
  }
}

/**
 * Mock Redis for BullMQ testing
 */
export class MockRedis {
  private data: Map<string, any>
  private queues: Map<string, any[]>

  constructor() {
    this.data = new Map()
    this.queues = new Map()
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }

  async get(key: string): Promise<any> {
    const value = this.data.get(key)
    return value ? JSON.parse(value) : null
  }

  async del(key: string): Promise<void> {
    this.data.delete(key)
  }

  async addToQueue(queueName: string, job: any): Promise<void> {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, [])
    }
    this.queues.get(queueName)!.push(job)
  }

  async getQueue(queueName: string): Promise<any[]> {
    return this.queues.get(queueName) || []
  }

  async clearQueue(queueName: string): Promise<void> {
    this.queues.set(queueName, [])
  }

  clear(): void {
    this.data.clear()
    this.queues.clear()
  }
}