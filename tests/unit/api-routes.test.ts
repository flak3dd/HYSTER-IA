/**
 * @jest-environment node
 *
 * API Route Handler Unit Tests
 * Tests Next.js API route handlers using mock request objects
 */

import { GET as getUsers, POST as createUser } from '@/app/api/admin/users/route'
import { GET as getImplants, POST as createImplant } from '@/app/api/admin/implants/route'
import { GET as getPayloads } from '@/app/api/admin/payloads/route'
import { safeRedirectTarget } from '@/lib/auth/redirect'

// Mock the auth module to bypass verification
jest.mock('@/lib/auth/admin', () => ({
  verifyAdmin: jest.fn().mockResolvedValue({ id: 'admin-1', username: 'admin', role: 'ADMIN' }),
  verifyAdminCookie: jest.fn().mockResolvedValue({ id: 'admin-1', username: 'admin', role: 'ADMIN' }),
  toErrorResponse: jest.fn((err: unknown) => {
    const status = (err as any)?.status ?? 500
    const message = err instanceof Error ? err.message : 'internal error'
    return new Response(JSON.stringify({ error: message }), { status })
  }),
  HttpError: class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  unauthorized: jest.fn((msg = 'unauthorized') => {
    const err = new (class extends Error { status = 401 })(msg)
    return err
  }),
  forbidden: jest.fn((msg = 'forbidden') => {
    const err = new (class extends Error { status = 403 })(msg)
    return err
  }),
}))

// Mock the DB modules
jest.mock('@/lib/db/users', () => ({
  listUsers: jest.fn().mockResolvedValue([
    { id: 'u1', displayName: 'Alice', authToken: 'tok1', status: 'active', quotaBytes: null, usedBytes: 0, expiresAt: null, createdAt: 1000, updatedAt: 1000, notes: undefined },
  ]),
  createUser: jest.fn().mockImplementation((data: any) => ({
    id: 'new-user',
    ...data,
    usedBytes: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
}))

jest.mock('@/lib/db/implants', () => ({
  listImplants: jest.fn().mockResolvedValue([
    { id: 'imp1', implantId: 'implant-1', name: 'Test', type: 'windows', architecture: 'x64', status: 'active', lastSeen: null, firstSeen: 1000, config: {}, transportConfig: {}, nodeId: null, createdAt: 1000, updatedAt: 1000 },
  ]),
  createImplant: jest.fn().mockImplementation((data: any) => ({
    id: 'new-implant',
    implantId: 'uuid-123',
    ...data,
    status: 'active',
    lastSeen: null,
    firstSeen: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  getImplantStats: jest.fn().mockResolvedValue({ total: 1, active: 1, inactive: 0, compromised: 0 }),
  countImplants: jest.fn().mockResolvedValue(1),
}))

jest.mock('@/lib/db/payload-builds', () => ({
  listPayloadBuilds: jest.fn().mockResolvedValue([
    { id: 'pb1', name: 'Build 1', type: 'windows', status: 'ready', config: {} },
  ]),
  getPayloadBuildStats: jest.fn().mockResolvedValue({ total: 1, pending: 0, building: 0, ready: 1, failed: 0 }),
  countPayloadBuilds: jest.fn().mockResolvedValue(1),
}))

jest.mock('@/lib/db/schema', () => ({
  ClientUserCreate: {
    safeParse: jest.fn().mockReturnValue({ success: true, data: { displayName: 'Test', authToken: 'valid-token' } }),
  },
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

function mockRequest(url: string, options?: RequestInit): any {
  return {
    url,
    headers: new Headers(options?.headers as Record<string, string> | undefined),
    json: jest.fn().mockResolvedValue(options?.body ? JSON.parse(options.body as string) : null),
    cookies: { get: jest.fn().mockReturnValue(undefined) },
  }
}

// ── Users API ────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('returns list of users', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/users')
    const response = await getUsers(req)
    const data = await response.json()
    expect(data.users).toBeDefined()
    expect(Array.isArray(data.users)).toBe(true)
  })
})

describe('POST /api/admin/users', () => {
  it('creates a user with valid data', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Test', authToken: 'valid-token' }),
    })
    const response = await createUser(req)
    expect(response.status).toBe(201)
  })
})

// ── Implants API ─────────────────────────────────────────────

describe('GET /api/admin/implants', () => {
  it('returns list of implants with stats', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/implants')
    const response = await getImplants(req)
    const data = await response.json()
    expect(data.implants).toBeDefined()
    expect(data.stats).toBeDefined()
    expect(data.stats.total).toBe(1)
  })
})

describe('POST /api/admin/implants', () => {
  it('creates an implant with valid data', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/implants', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Implant',
        type: 'linux',
        architecture: 'x64',
        config: {},
        transportConfig: {},
      }),
    })
    const response = await createImplant(req)
    expect(response.status).toBe(201)
  })
})

// ── Payloads API ─────────────────────────────────────────────

describe('GET /api/admin/payloads', () => {
  it('returns list of payload builds with stats', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/payloads')
    const response = await getPayloads(req)
    const data = await response.json()
    expect(data.builds).toBeDefined()
    expect(data.stats).toBeDefined()
  })
})
