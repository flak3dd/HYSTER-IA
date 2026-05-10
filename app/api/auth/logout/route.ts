import { NextResponse } from 'next/server'
import { revokeCurrentSession } from '@/lib/auth/session'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/auth/logout' })

export async function POST() {
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
    log.error({ err: error }, 'Logout error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
