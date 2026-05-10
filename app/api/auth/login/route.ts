import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { generateTokens, findUserByUsername } from '@/lib/auth/jwt'
import { safeRedirectTarget } from '@/lib/auth/redirect'
import { enforceRateLimit } from '@/lib/infrastructure/rate-limiter'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/auth/login' })

const LoginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(256),
  next: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(request, 'auth')
    if (rateLimited) return rateLimited

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { username, password, next } = LoginSchema.parse(body)

    // Find the operator
    const operator = await findUserByUsername(username)

    if (!operator) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if operator is active
    if (!operator.isActive) {
      return NextResponse.json(
        { error: 'Account is disabled' },
        { status: 401 }
      )
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, operator.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(operator.id)

    // Create response with cookies and redirect
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      operator: {
        id: operator.id,
        username: operator.username,
        role: operator.role,
        isActive: operator.isActive,
      },
      redirect: safeRedirectTarget(next)
    })

    // Set access token cookie
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    })

    // Set refresh token cookie
    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return response

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      )
    }
    log.error({ err: error }, 'Login error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}