import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production'
)

export interface JWTPayload {
  id: string
  username: string
  role: string
  isActive: boolean
  type: 'access' | 'refresh'
  iat?: number
  exp?: number
  [key: string]: any // Add index signature for jose compatibility
}

export interface Operator {
  id: string
  username: string
  password: string
  role: string
  isActive: boolean
  permissions: string[]
  skills: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Generate access and refresh tokens for an operator
 */
// Temporary in-memory user store (replace with database later)
const users = new Map([
  ['admin', {
    id: 'admin-001',
    username: 'admin',
    password: '$2b$12$bgMOb9gOYQ6UQmeFM14wzucoxjl7o3.QfViQubBA7yLR22bHna716', // 'admin123' hashed
    role: 'ADMIN',
    isActive: true,
    permissions: ['ALL'],
    skills: ['Red Team Operations', 'Penetration Testing', 'Security Assessment'],
    createdAt: new Date(),
    updatedAt: new Date()
  }]
])

export async function generateTokens(operatorId: string): Promise<{
  accessToken: string
  refreshToken: string
}> {
  // Find operator in memory store
  const operator = Array.from(users.values()).find(u => u.id === operatorId)

  if (!operator || !operator.isActive) {
    throw new Error('Operator not found or inactive')
  }

  // Generate access token (15 minutes)
  const accessToken = await new SignJWT({
    id: operator.id,
    username: operator.username,
    role: operator.role,
    isActive: operator.isActive,
    type: 'access'
  } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET)

  // Generate refresh token (7 days)
  const refreshToken = await new SignJWT({
    id: operator.id,
    username: operator.username,
    role: operator.role,
    isActive: operator.isActive,
    type: 'refresh'
  } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_REFRESH_SECRET)

  return { accessToken, refreshToken }
}

/**
 * Verify and decode an access token
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as JWTPayload
  } catch (error) {
    throw new Error('Invalid access token')
  }
}

/**
 * Verify and decode a refresh token
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_REFRESH_SECRET)
    return payload as JWTPayload
  } catch (error) {
    throw new Error('Invalid refresh token')
  }
}

/**
 * Get operator from access token
 */
export async function getOperatorFromAccessToken(token: string): Promise<Operator> {
  const payload = await verifyAccessToken(token)
  
  if (payload.type !== 'access') {
    throw new Error('Invalid token type')
  }

  const operator = Array.from(users.values()).find(u => u.id === payload.id)

  if (!operator || !operator.isActive) {
    throw new Error('Operator not found or inactive')
  }

  return operator
}

/**
 * Extract token from request
 */
export function extractTokenFromRequest(request: NextRequest): string | null {
  // Try to get from Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Try to get from cookies
  return request.cookies.get('access_token')?.value || null
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const payload = await verifyRefreshToken(refreshToken)
  
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type')
  }

  // Verify operator still exists and is active
  const operator = Array.from(users.values()).find(u => u.id === payload.id)

  if (!operator || !operator.isActive) {
    throw new Error('Operator not found or inactive')
  }

  // Generate new access token
  const newAccessToken = await new SignJWT({
    id: operator.id,
    username: operator.username,
    role: operator.role,
    isActive: operator.isActive,
    type: 'access'
  } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET)

  return newAccessToken
}

// Helper function to find user by username
export async function findUserByUsername(username: string): Promise<Operator | null> {
  return Array.from(users.values()).find(u => u.username === username) || null
}

/**
 * Check if operator has required permission
 */
export function hasPermission(operator: Operator, permission: string): boolean {
  if (operator.role === 'ADMIN') {
    return true
  }
  
  if (operator.permissions.includes('ALL')) {
    return true
  }
  
  return operator.permissions.includes(permission)
}

/**
 * Check if operator has required role
 */
export function hasRole(operator: Operator, role: string): boolean {
  if (operator.role === 'ADMIN') {
    return true
  }
  
  return operator.role === role
}

/**
 * Get role hierarchy level
 */
export function getRoleLevel(role: string): number {
  const hierarchy = {
    'VIEWER': 1,
    'ANALYST': 2,
    'OPERATOR': 3,
    'ADMIN': 4
  }
  
  return hierarchy[role as keyof typeof hierarchy] || 0
}

/**
 * Check if operator can access resource based on role hierarchy
 */
export function canAccess(operator: Operator, requiredRole: string): boolean {
  const operatorLevel = getRoleLevel(operator.role)
  const requiredLevel = getRoleLevel(requiredRole)
  
  return operatorLevel >= requiredLevel
}