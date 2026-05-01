/**
 * @jest-environment node
 *
 * Unit tests for app/api/admin/nodes/route.ts
 *
 * All external dependencies (auth, DB, next/server internals) are mocked so
 * the tests run without a database connection.
 */

jest.mock("@/lib/auth/admin", () => ({
  verifyAdmin: jest.fn(),
  toErrorResponse: jest.fn((err: unknown) => {
    const status = (err as any)?.status ?? 500
    const message = err instanceof Error ? err.message : "internal error"
    return { status, json: async () => ({ error: message }), _isMocked: true }
  }),
  HttpError: class HttpError extends Error {
    constructor(public status: number, msg: string) { super(msg) }
  },
  unauthorized: jest.fn(),
  forbidden: jest.fn(),
}))

jest.mock("@/lib/db/nodes", () => ({
  listNodes: jest.fn(),
  createNode: jest.fn(),
  countNodes: jest.fn(),
}))

import { GET, POST } from "@/app/api/admin/nodes/route"
import { verifyAdmin } from "@/lib/auth/admin"
import { listNodes, createNode, countNodes } from "@/lib/db/nodes"

const mockVerifyAdmin = verifyAdmin as jest.Mock
const mockListNodes = listNodes as jest.Mock
const mockCreateNode = createNode as jest.Mock
const mockCountNodes = countNodes as jest.Mock

const NOW = Date.now()

function makeNode(id = "n1") {
  return {
    id,
    name: "node-1",
    hostname: "10.0.0.1",
    listenAddr: ":443",
    status: "stopped",
    tags: [],
    profileId: null,
    lastHeartbeatAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeRequest(opts: { body?: unknown; authHeader?: string } = {}) {
  return {
    url: "http://localhost/api/admin/nodes",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization"
          ? opts.authHeader ?? "Bearer valid-token"
          : null,
    },
    json: jest.fn().mockResolvedValue(opts.body ?? {}),
  } as any
}

beforeEach(() => jest.clearAllMocks())

/* ------------------------------------------------------------------ */
/*  GET /api/admin/nodes                                               */
/* ------------------------------------------------------------------ */
describe("GET /api/admin/nodes", () => {
  it("returns nodes list when authenticated", async () => {
    mockVerifyAdmin.mockResolvedValue({ id: "op1", username: "admin", role: "ADMIN" })
    mockListNodes.mockResolvedValue([makeNode()])
    mockCountNodes.mockResolvedValue(1)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.nodes).toHaveLength(1)
    expect(body.nodes[0].id).toBe("n1")
    expect(body.pagination).toBeDefined()
    expect(body.pagination.total).toBe(1)
  })

  it("returns empty array when no nodes exist", async () => {
    mockVerifyAdmin.mockResolvedValue({ id: "op1", username: "admin", role: "ADMIN" })
    mockListNodes.mockResolvedValue([])
    mockCountNodes.mockResolvedValue(0)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.nodes).toHaveLength(0)
    expect(body.pagination.total).toBe(0)
  })

  it("propagates auth errors via toErrorResponse", async () => {
    const { HttpError } = jest.requireMock("@/lib/auth/admin")
    const authErr = new HttpError(401, "unauthorized")
    mockVerifyAdmin.mockRejectedValue(authErr)

    const res = await GET(makeRequest())
    // toErrorResponse mock returns { status, json }
    expect(res.status).toBe(401)
  })
})

/* ------------------------------------------------------------------ */
/*  POST /api/admin/nodes                                              */
/* ------------------------------------------------------------------ */
describe("POST /api/admin/nodes", () => {
  const validBody = { name: "node-1", hostname: "10.0.0.1" }

  it("creates and returns a node with status 201", async () => {
    mockVerifyAdmin.mockResolvedValue({ id: "op1", username: "admin", role: "ADMIN" })
    mockCreateNode.mockResolvedValue(makeNode("n-new"))

    const res = await POST(makeRequest({ body: validBody }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.node.id).toBe("n-new")
  })

  it("returns 400 for invalid body (missing hostname)", async () => {
    mockVerifyAdmin.mockResolvedValue({ id: "op1", username: "admin", role: "ADMIN" })

    const res = await POST(makeRequest({ body: { name: "node-only" } }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("bad_request")
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it("returns 400 when body is null (unparseable JSON)", async () => {
    mockVerifyAdmin.mockResolvedValue({ id: "op1", username: "admin", role: "ADMIN" })
    const req = {
      ...makeRequest(),
      json: jest.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    }

    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe("bad_request")
  })

  it("propagates auth errors", async () => {
    const { HttpError } = jest.requireMock("@/lib/auth/admin")
    mockVerifyAdmin.mockRejectedValue(new HttpError(403, "not an admin"))

    const res = await POST(makeRequest({ body: validBody }))
    expect(res.status).toBe(403)
  })
})
