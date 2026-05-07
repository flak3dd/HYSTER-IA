/**
 * Tests for newly added operational AI tools
 *
 * Covers:
 * - system_status
 * - list_users_info
 * - get_user_info
 * - manage_server
 * - get_client_config
 * - search_system
 * - list_credentials_info
 * - generate_plan
 * - check_prerequisites
 */

import {
  systemStatusTool,
  listUsersInfoTool,
  getUserInfoTool,
  manageServerTool,
  getClientConfigTool,
  searchSystemTool,
  listCredentialsInfoTool,
  generatePlanTool,
  checkPrerequisitesTool,
  AI_TOOLS,
  AI_TOOL_NAMES,
} from "@/lib/ai/tools"

describe("New Operational AI Tools", () => {
  const ctx = { signal: AbortSignal.timeout(5000), invokerUid: "test-user" }

  describe("Tool Registry", () => {
    it("should include all new tools in AI_TOOLS", () => {
      const expectedTools = [
        "system_status",
        "list_users_info",
        "get_user_info",
        "manage_server",
        "get_client_config",
        "search_system",
        "list_credentials_info",
        "generate_plan",
        "check_prerequisites",
      ]
      for (const name of expectedTools) {
        expect(AI_TOOLS).toHaveProperty(name)
        expect(AI_TOOL_NAMES).toContain(name)
      }
    })
  })

  describe("system_status", () => {
    it("should return system overview with required fields", async () => {
      const result = await systemStatusTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(result.server).toBeDefined()
      expect(result.nodes).toBeDefined()
      expect(result.users).toBeDefined()
      expect(result.credentials).toBeDefined()
      expect(result.implants).toBeDefined()
      expect(result.payloads).toBeDefined()
      expect(Array.isArray(result.errors)).toBe(true)
    })
  })

  describe("list_users_info", () => {
    it("should list users with default limit", async () => {
      const result = await listUsersInfoTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.users)).toBe(true)
      expect(typeof result.total).toBe("number")
    })

    it("should filter by status", async () => {
      const result = await listUsersInfoTool.run({ status: "active", limit: 10 }, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.users)).toBe(true)
    })
  })

  describe("get_user_info", () => {
    it("should return not found for invalid user", async () => {
      const result = await getUserInfoTool.run({ userId: "nonexistent-user-123" }, ctx)
      expect(result).toBeDefined()
      expect(result.found).toBe(false)
    })
  })

  describe("manage_server", () => {
    it("should return server status", async () => {
      const result = await manageServerTool.run({ action: "status" }, ctx)
      expect(result).toBeDefined()
      expect(typeof result.success).toBe("boolean")
      expect(typeof result.state).toBe("string")
      expect(result).toHaveProperty("pid")
    })
  })

  describe("get_client_config", () => {
    it("should fail for nonexistent user", async () => {
      const result = await getClientConfigTool.run(
        { userId: "nonexistent-user-123", format: "yaml" },
        ctx,
      )
      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })
  })

  describe("search_system", () => {
    it("should search across entities", async () => {
      const result = await searchSystemTool.run({ query: "test" }, ctx)
      expect(result).toBeDefined()
      expect(result.results).toBeDefined()
      expect(Array.isArray(result.results.nodes)).toBe(true)
      expect(Array.isArray(result.results.users)).toBe(true)
      expect(Array.isArray(result.results.beacons)).toBe(true)
      expect(Array.isArray(result.results.implants)).toBe(true)
      expect(typeof result.totalHits).toBe("number")
    })
  })

  describe("list_credentials_info", () => {
    it("should list credentials", async () => {
      const result = await listCredentialsInfoTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.credentials)).toBe(true)
      expect(typeof result.total).toBe("number")
      expect(typeof result.verified).toBe("number")
      expect(typeof result.unverified).toBe("number")
    })
  })

  describe("generate_plan", () => {
    it("should generate deployment plan", async () => {
      const result = await generatePlanTool.run(
        { goal: "deploy a new node to hetzner" },
        ctx,
      )
      expect(result).toBeDefined()
      expect(Array.isArray(result.steps)).toBe(true)
      expect(result.steps.length).toBeGreaterThan(0)
      expect(typeof result.totalSteps).toBe("number")
      expect(Array.isArray(result.risks)).toBe(true)
    })

    it("should generate diagnostic plan", async () => {
      const result = await generatePlanTool.run(
        { goal: "diagnose server problems", constraints: ["fast resolution"] },
        ctx,
      )
      expect(result).toBeDefined()
      expect(Array.isArray(result.steps)).toBe(true)
      expect(result.steps.some((s) => s.tool === "system_status")).toBe(true)
    })
  })

  describe("check_prerequisites", () => {
    it("should check deploy_node prerequisites", async () => {
      const result = await checkPrerequisitesTool.run({ operation: "deploy_node" }, ctx)
      expect(result).toBeDefined()
      expect(typeof result.ready).toBe("boolean")
      expect(Array.isArray(result.checks)).toBe(true)
      expect(Array.isArray(result.missingItems)).toBe(true)
    })

    it("should check general prerequisites", async () => {
      const result = await checkPrerequisitesTool.run({ operation: "general" }, ctx)
      expect(result).toBeDefined()
      expect(typeof result.ready).toBe("boolean")
    })
  })
})
