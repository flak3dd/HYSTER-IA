import { NextRequest, NextResponse } from "next/server"
import { verifyRefreshToken, generateTokens } from "@/lib/auth/jwt"

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get("refresh_token")?.value

    if (!refreshToken) {
      return NextResponse.json({ error: "no refresh token" }, { status: 401 })
    }

    const payload = await verifyRefreshToken(refreshToken)

    if (payload.type !== "refresh") {
      return NextResponse.json({ error: "invalid token type" }, { status: 401 })
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(payload.id)

    const response = NextResponse.json({ ok: true })

    response.cookies.set("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60,
      path: "/",
    })

    // Rotate the refresh token
    response.cookies.set("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    })

    return response
  } catch {
    return NextResponse.json({ error: "invalid or expired refresh token" }, { status: 401 })
  }
}
