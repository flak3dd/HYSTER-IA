/**
 * @jest-environment node
 *
 * Unit tests for app/api/admin/implants/route.ts
 */

jest.mock("@/lib/db/implants", () => ({
  listImplants: jest.fn(),
  createImplant: jest.fn(),
  getImplantStats: jest.fn(),
  countImplants: jest.fn(),
}))

import { GET, POST } from "@/app/api/admin/implants/route"
import { listImplants, createImplant, getImplantStats, countImplants } from "@/lib/db/implants"

const mockListImplants = listImplants as jest.Mock
const mockCreateImplant = createImplant as jest.Mock
const mockGetStats = getImplantStats as jest.Mock
const mockCountImplants = countImplants as jest.Mock

const NOW = Date.now()

function makeImplant(id = "i1") {
  return {
    id,
    implantId: `imp-${id}`,
    name: "test-implant",
    type: "shell",
    architecture: "x86_64",
    status: "active",
    firstSeen: NOW,
    config: {},
    transportConfig: {},
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const defaultStats = { total: 1, active: 1, inactive: 0, compromised: 0 }

function makeRequest(body?: unknown) {
  return {
    url: "http://localhost/api/admin/implants",
    headers: { get: () => null },
    json: jest.fn().mockResolvedValue(body ?? {}),
  } as any
}

beforeEach(() => jest.clearAllMocks())

/* ------------------------------------------------------------------ */
/*  GET /api/admin/implants                                            */
/* ------------------------------------------------------------------ */
describe("GET /api/admin/implants", () => {
  it("returns implants list, pagination, and stats", async () => {
    mockListImplants.mockResolvedValue([makeImplant()])
    mockCountImplants.mockResolvedValue(1)
    mockGetStats.mockResolvedValue(defaultStats)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.implants).toHaveLength(1)
    expect(body.stats.total).toBe(1)
    expect(body.pagination).toBeDefined()
    expect(body.pagination.total).toBe(1)
  })

  it("returns empty implants when none exist", async () => {
    mockListImplants.mockResolvedValue([])
    mockCountImplants.mockResolvedValue(0)
    mockGetStats.mockResolvedValue({ total: 0, active: 0, inactive: 0, compromised: 0 })

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.implants).toHaveLength(0)
    expect(body.pagination.total).toBe(0)
  })

  it("returns 500 when db throws", async () => {
    mockListImplants.mockRejectedValue(new Error("db error"))
    mockCountImplants.mockResolvedValue(0)
    mockGetStats.mockResolvedValue(defaultStats)

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

/* ------------------------------------------------------------------ */
/*  POST /api/admin/implants                                           */
/* ------------------------------------------------------------------ */
describe("POST /api/admin/implants", () => {
  const validBody = {
    name: "dropper",
    type: "shell",
    architecture: "x86_64",
    config: {},
    transportConfig: {},
  }

  it("creates an implant and returns 201", async () => {
    mockCreateImplant.mockResolvedValue(makeImplant("i-new"))

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.id).toBe("i-new")
  })

  it("returns 400 for invalid body (missing type)", async () => {
    const badBody = { name: "dropper", architecture: "x86_64", config: {}, transportConfig: {} }
    const res = await POST(makeRequest(badBody))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it("returns 400 for missing architecture", async () => {
    const badBody = { name: "dropper", type: "shell", config: {}, transportConfig: {} }
    const res = await POST(makeRequest(badBody))
    expect(res.status).toBe(400)
  })

  it("returns 500 when createImplant throws an unexpected error", async () => {
    mockCreateImplant.mockRejectedValue(new Error("Unexpected db error"))

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
  })
})
