/**
 * @jest-environment node
 *
 * Unit tests for app/api/admin/payloads/route.ts
 */

jest.mock("@/lib/db/payload-builds", () => ({
  listPayloadBuilds: jest.fn(),
  createPayloadBuild: jest.fn(),
  deletePayloadBuild: jest.fn(),
  getPayloadBuildStats: jest.fn(),
  countPayloadBuilds: jest.fn(),
}))

import { GET, POST, DELETE } from "@/app/api/admin/payloads/route"
import {
  listPayloadBuilds,
  createPayloadBuild,
  deletePayloadBuild,
  getPayloadBuildStats,
  countPayloadBuilds,
} from "@/lib/db/payload-builds"

const mockList = listPayloadBuilds as jest.Mock
const mockCreate = createPayloadBuild as jest.Mock
const mockDelete = deletePayloadBuild as jest.Mock
const mockStats = getPayloadBuildStats as jest.Mock
const mockCount = countPayloadBuilds as jest.Mock

const NOW = Date.now()

function makeBuild(id = "pb1") {
  return {
    id,
    name: "dropper-v1",
    type: "exe",
    status: "pending",
    config: {},
    buildLogs: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const defaultStats = { total: 1, pending: 1, building: 0, ready: 0, failed: 0 }

function makeRequest(opts: { url?: string; body?: unknown } = {}) {
  return {
    url: opts.url ?? "http://localhost/api/admin/payloads",
    headers: { get: () => null },
    json: jest.fn().mockResolvedValue(opts.body ?? {}),
  } as any
}

beforeEach(() => jest.clearAllMocks())

/* ------------------------------------------------------------------ */
/*  GET /api/admin/payloads                                            */
/* ------------------------------------------------------------------ */
describe("GET /api/admin/payloads", () => {
  it("returns builds list, pagination, and stats", async () => {
    mockList.mockResolvedValue([makeBuild()])
    mockCount.mockResolvedValue(1)
    mockStats.mockResolvedValue(defaultStats)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.builds).toHaveLength(1)
    expect(body.stats.total).toBe(1)
    expect(body.pagination).toBeDefined()
    expect(body.pagination.total).toBe(1)
  })

  it("respects createdBy query param", async () => {
    mockList.mockResolvedValue([])
    mockCount.mockResolvedValue(0)
    mockStats.mockResolvedValue({ ...defaultStats, total: 0 })

    const res = await GET(makeRequest({ url: "http://localhost/api/admin/payloads?createdBy=alice" }))
    expect(res.status).toBe(200)

    // Ensure listPayloadBuilds was called with the createdBy arg
    expect(mockList).toHaveBeenCalledWith("alice", expect.any(Number), expect.any(Object))
  })

  it("returns 500 on db error", async () => {
    mockList.mockRejectedValue(new Error("db down"))
    mockCount.mockResolvedValue(0)
    mockStats.mockResolvedValue(defaultStats)

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})

/* ------------------------------------------------------------------ */
/*  POST /api/admin/payloads                                           */
/* ------------------------------------------------------------------ */
describe("POST /api/admin/payloads", () => {
  const validBody = { name: "dropper", type: "exe", config: {} }

  it("creates a build and returns 201", async () => {
    mockCreate.mockResolvedValue(makeBuild("pb-new"))

    const res = await POST(makeRequest({ body: validBody }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe("pb-new")
  })

  it("returns 400 for missing name", async () => {
    const res = await POST(makeRequest({ body: { type: "exe", config: {} } }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it("returns 400 for missing config", async () => {
    const res = await POST(makeRequest({ body: { name: "dropper", type: "exe" } }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for description over 500 chars", async () => {
    const res = await POST(
      makeRequest({ body: { ...validBody, description: "x".repeat(501) } }),
    )
    expect(res.status).toBe(400)
  })

  it("returns 500 on unexpected createPayloadBuild error", async () => {
    mockCreate.mockRejectedValue(new Error("disk full"))
    const res = await POST(makeRequest({ body: validBody }))
    expect(res.status).toBe(500)
  })
})

/* ------------------------------------------------------------------ */
/*  DELETE /api/admin/payloads?id=...                                  */
/* ------------------------------------------------------------------ */
describe("DELETE /api/admin/payloads", () => {
  it("deletes and returns success", async () => {
    mockDelete.mockResolvedValue(true)

    const res = await DELETE(makeRequest({ url: "http://localhost/api/admin/payloads?id=pb1" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it("returns 400 when id param is missing", async () => {
    const res = await DELETE(makeRequest({ url: "http://localhost/api/admin/payloads" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/id/)
  })

  it("returns 404 when build not found", async () => {
    mockDelete.mockResolvedValue(false)

    const res = await DELETE(makeRequest({ url: "http://localhost/api/admin/payloads?id=missing" }))
    expect(res.status).toBe(404)
  })

  it("returns 500 on unexpected error", async () => {
    mockDelete.mockRejectedValue(new Error("db error"))

    const res = await DELETE(makeRequest({ url: "http://localhost/api/admin/payloads?id=pb1" }))
    expect(res.status).toBe(500)
  })
})
