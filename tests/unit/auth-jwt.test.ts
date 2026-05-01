/**
 * @jest-environment node
 *
 * Unit tests for the pure utility functions in lib/auth/jwt.ts
 * (hasPermission, hasRole, canAccess, getRoleLevel)
 *
 * Functions that hit the DB (generateTokens, getOperatorFromAccessToken, etc.)
 * are covered via integration-style mocking in auth-admin.test.ts.
 * verifyAccessToken / verifyRefreshToken are tested below by mocking jose.
 */

// Mock jose before importing jwt
jest.mock("jose", () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}))

// Mock @/lib/db so prisma is never initialised
jest.mock("@/lib/db", () => ({
  prisma: {
    operator: {
      findUnique: jest.fn(),
    },
  },
}))

import { jwtVerify } from "jose"
import {
  verifyAccessToken,
  verifyRefreshToken,
  hasPermission,
  hasRole,
  canAccess,
  getRoleLevel,
  type Operator,
} from "@/lib/auth/jwt"

const mockJwtVerify = jwtVerify as jest.Mock

/* ------------------------------------------------------------------ */
/*  getRoleLevel                                                       */
/* ------------------------------------------------------------------ */
describe("getRoleLevel()", () => {
  it("returns correct hierarchy levels", () => {
    expect(getRoleLevel("VIEWER")).toBe(1)
    expect(getRoleLevel("ANALYST")).toBe(2)
    expect(getRoleLevel("OPERATOR")).toBe(3)
    expect(getRoleLevel("ADMIN")).toBe(4)
  })

  it("returns 0 for unknown role", () => {
    expect(getRoleLevel("UNKNOWN")).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/*  hasPermission                                                      */
/* ------------------------------------------------------------------ */
describe("hasPermission()", () => {
  function makeOperator(role: string, permissions: string[]): Operator {
    return {
      id: "op1",
      username: "test",
      password: "hash",
      role,
      isActive: true,
      permissions,
      skills: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  it("ADMIN always has any permission", () => {
    expect(hasPermission(makeOperator("ADMIN", []), "nodes:read")).toBe(true)
  })

  it("operator with ALL permission has any permission", () => {
    expect(hasPermission(makeOperator("OPERATOR", ["ALL"]), "nodes:delete")).toBe(true)
  })

  it("returns true when specific permission is present", () => {
    expect(hasPermission(makeOperator("OPERATOR", ["nodes:read"]), "nodes:read")).toBe(true)
  })

  it("returns false when specific permission is absent", () => {
    expect(hasPermission(makeOperator("OPERATOR", ["nodes:read"]), "nodes:delete")).toBe(false)
  })

  it("VIEWER with no permissions returns false", () => {
    expect(hasPermission(makeOperator("VIEWER", []), "anything")).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  hasRole                                                            */
/* ------------------------------------------------------------------ */
describe("hasRole()", () => {
  function makeOperator(role: string): Operator {
    return { id: "op1", username: "u", password: "h", role, isActive: true, permissions: [], skills: [], createdAt: new Date(), updatedAt: new Date() }
  }

  it("ADMIN always satisfies any role check", () => {
    expect(hasRole(makeOperator("ADMIN"), "VIEWER")).toBe(true)
    expect(hasRole(makeOperator("ADMIN"), "OPERATOR")).toBe(true)
  })

  it("exact role match returns true", () => {
    expect(hasRole(makeOperator("ANALYST"), "ANALYST")).toBe(true)
  })

  it("returns false for different role", () => {
    expect(hasRole(makeOperator("VIEWER"), "ANALYST")).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  canAccess                                                          */
/* ------------------------------------------------------------------ */
describe("canAccess()", () => {
  function makeOperator(role: string): Operator {
    return { id: "op1", username: "u", password: "h", role, isActive: true, permissions: [], skills: [], createdAt: new Date(), updatedAt: new Date() }
  }

  it("ADMIN can access any required role level", () => {
    expect(canAccess(makeOperator("ADMIN"), "ADMIN")).toBe(true)
    expect(canAccess(makeOperator("ADMIN"), "OPERATOR")).toBe(true)
  })

  it("OPERATOR can access ANALYST level but not ADMIN", () => {
    expect(canAccess(makeOperator("OPERATOR"), "ANALYST")).toBe(true)
    expect(canAccess(makeOperator("OPERATOR"), "ADMIN")).toBe(false)
  })

  it("VIEWER cannot access ANALYST level", () => {
    expect(canAccess(makeOperator("VIEWER"), "ANALYST")).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  verifyAccessToken                                                  */
/* ------------------------------------------------------------------ */
describe("verifyAccessToken()", () => {
  beforeEach(() => jest.clearAllMocks())

  it("returns the decoded payload on success", async () => {
    const fakePayload = { id: "op1", username: "admin", role: "ADMIN", isActive: true, type: "access" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyAccessToken("valid.token.here")
    expect(result.id).toBe("op1")
    expect(result.type).toBe("access")
  })

  it("throws on invalid token", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTInvalid"))

    await expect(verifyAccessToken("bad.token")).rejects.toThrow("Invalid access token")
  })
})

/* ------------------------------------------------------------------ */
/*  verifyRefreshToken                                                 */
/* ------------------------------------------------------------------ */
describe("verifyRefreshToken()", () => {
  beforeEach(() => jest.clearAllMocks())

  it("returns the decoded payload on success", async () => {
    const fakePayload = { id: "op1", username: "admin", role: "ADMIN", isActive: true, type: "refresh" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyRefreshToken("valid.refresh.token")
    expect(result.type).toBe("refresh")
  })

  it("throws on invalid refresh token", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTExpired"))

    await expect(verifyRefreshToken("expired.token")).rejects.toThrow("Invalid refresh token")
  })
})
