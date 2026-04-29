import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { generateTokens, findUserByUsername } from '@/lib/auth/jwt'
import { safeRedirectTarget } from '@/lib/auth/redirect'

export async function POST(request: NextRequest) {
  try {
    const { username, password, next } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password required' },
        { status: 400 }
      )
    }

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
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}