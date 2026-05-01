/**
 * @jest-environment node
 *
 * Unit tests for lib/auth/admin.ts
 *
 * Mocks: lib/auth/session, lib/auth/jwt, next/server
 */

// Mock session and jwt before importing admin
jest.mock("@/lib/auth/session", () => ({
  readSession: jest.fn(),
}))
jest.mock("@/lib/auth/jwt", () => ({
  getOperatorFromAccessToken: jest.fn(),
  extractTokenFromRequest: jest.fn(),
}))

import { NextResponse } from "next/server"
import {
  HttpError,
  unauthorized,
  forbidden,
  toErrorResponse,
  verifyAdmin,
} from "@/lib/auth/admin"
import { readSession } from "@/lib/auth/session"
import { getOperatorFromAccessToken, extractTokenFromRequest } from "@/lib/auth/jwt"

const mockReadSession = readSession as jest.Mock
const mockGetOperator = getOperatorFromAccessToken as jest.Mock
const mockExtractToken = extractTokenFromRequest as jest.Mock

/* ------------------------------------------------------------------ */
/*  HttpError                                                          */
/* ------------------------------------------------------------------ */
describe("HttpError", () => {
  it("stores status and message", () => {
    const err = new HttpError(404, "not found")
    expect(err.status).toBe(404)
    expect(err.message).toBe("not found")
    expect(err).toBeInstanceOf(Error)
  })
})

/* ------------------------------------------------------------------ */
/*  unauthorized / forbidden helpers                                   */
/* ------------------------------------------------------------------ */
describe("unauthorized()", () => {
  it("returns HttpError with status 401", () => {
    const err = unauthorized()
    expect(err).toBeInstanceOf(HttpError)
    expect(err.status).toBe(401)
    expect(err.message).toBe("unauthorized")
  })

  it("accepts custom message", () => {
    const err = unauthorized("no session")
    expect(err.message).toBe("no session")
  })
})

describe("forbidden()", () => {
  it("returns HttpError with status 403", () => {
    const err = forbidden()
    expect(err).toBeInstanceOf(HttpError)
    expect(err.status).toBe(403)
    expect(err.message).toBe("forbidden")
  })

  it("accepts custom message", () => {
    expect(forbidden("not an admin").message).toBe("not an admin")
  })
})

/* ------------------------------------------------------------------ */
/*  toErrorResponse                                                    */
/* ------------------------------------------------------------------ */
describe("toErrorResponse()", () => {
  it("returns 401 for unauthorized HttpError", async () => {
    const res = toErrorResponse(unauthorized())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("unauthorized")
  })

  it("returns 403 for forbidden HttpError", async () => {
    const res = toErrorResponse(forbidden("not an admin"))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("not an admin")
  })

  it("returns 500 for generic Error", async () => {
    const res = toErrorResponse(new Error("db failure"))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("db failure")
  })

  it("returns 500 with 'internal error' for non-Error throws", async () => {
    const res = toErrorResponse("something weird")
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("internal error")
  })
})

/* ------------------------------------------------------------------ */
/*  verifyAdmin — bearer token path                                    */
/* ------------------------------------------------------------------ */
describe("verifyAdmin() — bearer token", () => {
  function makeRequest(authHeader?: string) {
    return {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "authorization" ? (authHeader ?? null) : null,
      },
    } as any
  }

  beforeEach(() => jest.clearAllMocks())

  it("returns principal when bearer token resolves to ADMIN", async () => {
    mockExtractToken.mockReturnValue(null)
    const req = makeRequest("Bearer valid-token")
    mockGetOperator.mockResolvedValue({ id: "op1", username: "admin", role: "ADMIN", isActive: true, permissions: [], skills: [] })

    const principal = await verifyAdmin(req)
    expect(principal.role).toBe("ADMIN")
    expect(principal.username).toBe("admin")
  })

  it("throws forbidden when bearer token resolves to non-admin role", async () => {
    mockExtractToken.mockReturnValue(null)
    const req = makeRequest("Bearer operator-token")
    mockGetOperator.mockResolvedValue({ id: "op2", username: "op", role: "OPERATOR", isActive: true, permissions: [], skills: [] })

    await expect(verifyAdmin(req)).rejects.toBeInstanceOf(HttpError)
    await expect(verifyAdmin(req)).rejects.toMatchObject({ status: 403 })
  })

  it("throws when jwt verification fails (bad token)", async () => {
    mockExtractToken.mockReturnValue(null)
    const req = makeRequest("Bearer bad-token")
    mockGetOperator.mockRejectedValue(new Error("Invalid access token"))

    await expect(verifyAdmin(req)).rejects.toThrow()
  })
})

/* ------------------------------------------------------------------ */
/*  verifyAdmin — cookie / session fallback                            */
/* ------------------------------------------------------------------ */
describe("verifyAdmin() — session cookie fallback", () => {
  function makeRequestNoBearer() {
    return {
      headers: { get: () => null },
    } as any
  }

  beforeEach(() => jest.clearAllMocks())

  it("returns principal from valid admin session", async () => {
    mockExtractToken.mockReturnValue(null)
    mockReadSession.mockResolvedValue({ id: "s1", username: "cookieAdmin", role: "ADMIN" })

    const principal = await verifyAdmin(makeRequestNoBearer())
    expect(principal.username).toBe("cookieAdmin")
  })

  it("throws unauthorized when no session exists", async () => {
    mockExtractToken.mockReturnValue(null)
    mockReadSession.mockResolvedValue(null)

    await expect(verifyAdmin(makeRequestNoBearer())).rejects.toBeInstanceOf(HttpError)
    await expect(verifyAdmin(makeRequestNoBearer())).rejects.toMatchObject({ status: 401 })
  })

  it("throws forbidden when session role is not ADMIN", async () => {
    mockExtractToken.mockReturnValue(null)
    mockReadSession.mockResolvedValue({ id: "s2", username: "viewer", role: "VIEWER" })

    await expect(verifyAdmin(makeRequestNoBearer())).rejects.toMatchObject({ status: 403 })
  })
})
