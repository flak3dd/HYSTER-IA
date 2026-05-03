/**
 * Test helper utilities
 * Common functions and helpers for test suites
 */

import { PrismaClient } from '@prisma/client'

/**
 * Generate a random test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      const delay = baseDelay * Math.pow(2, i)
      await wait(delay)
    }
  }

  throw lastError
}

/**
 * Mock API response
 */
export function mockApiResponse<T>(data: T, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: function () {
      return this
    },
  } as Response
}

/**
 * Mock fetch function
 */
export function mockFetch(responses: Record<string, any>) {
  global.fetch = jest.fn(async (url: string) => {
    const key = Object.keys(responses).find(key => url.includes(key))
    if (key) {
      return mockApiResponse(responses[key])
    }
    throw new Error(`No mock response for URL: ${url}`)
  }) as jest.Mock
}

/**
 * Restore original fetch
 */
export function restoreFetch() {
  if (global.fetch) {
    (global.fetch as jest.Mock).mockRestore()
  }
}

/**
 * Create a mock Prisma client for testing
 */
export function createMockPrismaClient() {
  return {
    operator: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    operation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    implant: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    hysteriaNode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shadowGrokExecution: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shadowGrokToolCall: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $disconnect: jest.fn(),
  } as any
}

/**
 * Assert that an object has required properties
 */
export function assertHasProperties<T extends object>(
  obj: T,
  properties: (keyof T)[]
): void {
  properties.forEach(prop => {
    expect(obj).toHaveProperty(String(prop))
  })
}

/**
 * Create a mock date
 */
export function mockDate(date: string | Date) {
  const mockDate = new Date(date)
  jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime())
  jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockDate.toISOString())
}

/**
 * Restore original Date
 */
export function restoreDate() {
  jest.restoreAllMocks()
}

/**
 * Mock console methods
 */
export function mockConsole() {
  const originalConsole = { ...console }
  beforeEach(() => {
    console.log = jest.fn()
    console.error = jest.fn()
    console.warn = jest.fn()
    console.info = jest.fn()
  })

  afterEach(() => {
    console = originalConsole
  })
}

/**
 * Setup and teardown for Prisma tests
 */
export function setupPrismaTest() {
  let prisma: PrismaClient | undefined

  beforeEach(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    })
  })

  afterEach(async () => {
    await prisma?.$disconnect()
  })

  return { prisma: prisma! }
}

/**
 * Mock environment variables
 */
export function mockEnv(vars: Record<string, string>) {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    Object.assign(process.env, vars)
  })

  afterEach(() => {
    process.env = originalEnv
  })
}

/**
 * Create a mock WebSocket connection
 */
export function createMockWebSocket() {
  return {
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    readyState: 1, // OPEN
  }
}

/**
 * Mock file system operations
 */
export function mockFileSystem() {
  const mockFs = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
  }

  jest.mock('fs', () => mockFs)
  return mockFs
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Generate test email addresses
 */
export function generateTestEmails(count: number): string[] {
  const emails: string[] = []
  for (let i = 0; i < count; i++) {
    emails.push(`test${i}@example.com`)
  }
  return emails
}

/**
 * Generate test domains
 */
export function generateTestDomains(count: number): string[] {
  const domains: string[] = []
  const tlds = ['.com', '.org', '.net', '.io', '.co']
  for (let i = 0; i < count; i++) {
    const domain = `test${i}-${Math.random().toString(36).substr(2, 5)}${tlds[i % tlds.length]}`
    domains.push(domain)
  }
  return domains
}