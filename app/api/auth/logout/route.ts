import { NextRequest, NextResponse } from 'next/server'
import { revokeCurrentSession } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  try {
    await revokeCurrentSession()

    const response = NextResponse.json({
      success: true,
      message: 'Logout successful'
    })

    // Also clear cookies on the response to ensure the browser receives
    // explicit Set-Cookie headers with maxAge=0
    response.cookies.set('access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })

    response.cookies.set('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })

    return response

  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
