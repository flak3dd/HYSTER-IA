import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-change-in-production')

export async function proxy(req: NextRequest): Promise<NextResponse> {
  // Skip authentication for login page and auth API routes
  const { pathname } = req.nextUrl
  const publicRoutes = ['/login', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout']
  
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Check for access token
  const accessToken = req.cookies.get('access_token')?.value
  
  if (!accessToken) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  try {
    // Verify the JWT token
    await jwtVerify(accessToken, secret)
    return NextResponse.next()
  } catch (error) {
    console.error('JWT verification failed:', error)
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ["/admin/:path*"],
}
