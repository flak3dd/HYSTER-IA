import { NextResponse, type NextRequest } from "next/server"

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "__session"

export function proxy(req: NextRequest): NextResponse {
  const cookie = req.cookies.get(COOKIE_NAME)?.value
  if (!cookie) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
