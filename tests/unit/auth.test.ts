/**
 * @jest-environment node
 *
 * Auth Unit Tests
 * Tests for pure utility functions in auth modules.
 * Functions that depend on jose/prisma are tested via mocks.
 */

import { safeRedirectTarget, DEFAULT_REDIRECT } from '@/lib/auth/redirect'
import { HttpError, unauthorized, forbidden, toErrorResponse } from '@/lib/auth/admin'
import { NextResponse } from 'next/server'

// Mock jose for jwt.ts imports
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    operator: {
      findUnique: jest.fn(),
    },
  },
}))

// Import after mocks are set up
import { hasPermission, parseStringArray } from '@/lib/auth/jwt'
import type { Operator } from '@/lib/auth/jwt'

// ── safeRedirectTarget ──────────────────────────────────────

describe('safeRedirectTarget', () => {
  it('returns /admin for null input', () => {
    expect(safeRedirectTarget(null)).toBe(DEFAULT_REDIRECT)
  })

  it('returns /admin for undefined input', () => {
    expect(safeRedirectTarget(undefined)).toBe(DEFAULT_REDIRECT)
  })

  it('returns /admin for empty string', () => {
    expect(safeRedirectTarget('')).toBe(DEFAULT_REDIRECT)
  })

  it('returns /admin for non-string input', () => {
    expect(safeRedirectTarget(42 as any)).toBe(DEFAULT_REDIRECT)
  })

  it('blocks absolute HTTPS URLs', () => {
    expect(safeRedirectTarget('https://evil.com')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks absolute HTTP URLs', () => {
    expect(safeRedirectTarget('http://evil.com')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks protocol-relative URLs', () => {
    expect(safeRedirectTarget('//evil.com')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks javascript: URIs', () => {
    expect(safeRedirectTarget('javascript:alert(1)')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks mixed-case javascript: URIs', () => {
    expect(safeRedirectTarget('JaVaScRiPt:alert(1)')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks URLs with :// scheme', () => {
    expect(safeRedirectTarget('ftp://evil.com')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks paths outside /admin', () => {
    expect(safeRedirectTarget('/other/path')).toBe(DEFAULT_REDIRECT)
  })

  it('blocks root path', () => {
    expect(safeRedirectTarget('/')).toBe(DEFAULT_REDIRECT)
  })

  it('allows /admin', () => {
    expect(safeRedirectTarget('/admin')).toBe('/admin')
  })

  it('allows /admin/ with trailing slash', () => {
    expect(safeRedirectTarget('/admin/')).toBe('/admin/')
  })

  it('allows deep admin paths', () => {
    expect(safeRedirectTarget('/admin/configs')).toBe('/admin/configs')
  })

  it('preserves query strings on admin paths', () => {
    expect(safeRedirectTarget('/admin/configs?nodes=abc')).toBe('/admin/configs?nodes=abc')
  })

  it('preserves hash fragments on admin paths', () => {
    expect(safeRedirectTarget('/admin/configs#section')).toBe('/admin/configs#section')
  })

  it('strips non-admin path from URL with encoded chars', () => {
    const result = safeRedirectTarget('/admin/%2e%2e/evil')
    expect(result).toBe(DEFAULT_REDIRECT)
  })

  it('handles malformed URL gracefully', () => {
    // '/admin/%%invalid' starts with /admin/ so the function allows it;
    // the URL parser normalises %% to a valid path component
    const result = safeRedirectTarget('/admin/%%invalid')
    expect(result.startsWith('/admin/')).toBe(true)
  })
})

// ── hasPermission ────────────────────────────────────────────

describe('hasPermission', () => {
  const baseOperator: Operator = {
    id: 'op-1',
    username: 'testuser',
    password: 'hashed',
    role: 'OPERATOR',
    isActive: true,
    permissions: ['read', 'write'],
    skills: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('returns true for ADMIN role regardless of permissions', () => {
    const admin = { ...baseOperator, role: 'ADMIN', permissions: [] }
    expect(hasPermission(admin, 'anything')).toBe(true)
  })

  it('returns true when operator has ALL permission', () => {
    const op = { ...baseOperator, permissions: ['ALL'] }
    expect(hasPermission(op, 'anything')).toBe(true)
  })

  it('returns true when operator has the specific permission', () => {
    expect(hasPermission(baseOperator, 'read')).toBe(true)
    expect(hasPermission(baseOperator, 'write')).toBe(true)
  })

  it('returns false when operator lacks the permission', () => {
    expect(hasPermission(baseOperator, 'execute')).toBe(false)
  })

  it('returns false for empty permissions array', () => {
    const op = { ...baseOperator, permissions: [] }
    expect(hasPermission(op, 'read')).toBe(false)
  })
})

// ── parseStringArray ─────────────────────────────────────────

describe('parseStringArray', () => {
  it('parses a valid JSON array of strings', () => {
    expect(parseStringArray('["a","b","c"]')).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseStringArray('not json')).toEqual([])
  })

  it('filters out non-string items', () => {
    expect(parseStringArray('["a", 1, true, "b"]')).toEqual(['a', 'b'])
  })

  it('returns empty array for JSON non-array', () => {
    expect(parseStringArray('{"key": "val"}')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseStringArray('')).toEqual([])
  })
})

// ── HttpError / unauthorized / forbidden / toErrorResponse ──

describe('HttpError', () => {
  it('creates error with status and message', () => {
    const err = new HttpError(400, 'bad request')
    expect(err.status).toBe(400)
    expect(err.message).toBe('bad request')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(HttpError)
  })

  it('unauthorized creates 401 error', () => {
    const err = unauthorized('no auth')
    expect(err.status).toBe(401)
    expect(err.message).toBe('no auth')
  })

  it('unauthorized uses default message', () => {
    const err = unauthorized()
    expect(err.status).toBe(401)
    expect(err.message).toBe('unauthorized')
  })

  it('forbidden creates 403 error', () => {
    const err = forbidden('no access')
    expect(err.status).toBe(403)
    expect(err.message).toBe('no access')
  })

  it('forbidden uses default message', () => {
    const err = forbidden()
    expect(err.status).toBe(403)
    expect(err.message).toBe('forbidden')
  })

  it('toErrorResponse handles HttpError', () => {
    const response = toErrorResponse(new HttpError(403, 'denied'))
    expect(response).toBeInstanceOf(NextResponse)
    expect(response.status).toBe(403)
  })

  it('toErrorResponse handles generic Error', () => {
    const response = toErrorResponse(new Error('boom'))
    expect(response.status).toBe(500)
  })

  it('toErrorResponse handles non-Error', () => {
    const response = toErrorResponse('string error')
    expect(response.status).toBe(500)
  })
})
