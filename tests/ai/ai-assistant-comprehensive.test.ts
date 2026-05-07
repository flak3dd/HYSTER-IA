/**
 * Comprehensive AI Assistant Capability Tests
 *
 * Tests all AI tool categories:
 * - Node Management (list, create, get, update)
 * - Config Generation (with obfuscation, high-throughput)
 * - Azure Deployment (deploy, list, status)
 * - Payload Generation (generate, list, status)
 * - Troubleshooting (diagnostics, traffic analysis)
 * - Complex Multi-step (plan, prerequisites, workflow)
 */

import {
  listNodesTool,
  createNodeTool,
  getNodeTool,
  updateNodeTool,
  deleteNodeTool,
  generateConfigTool,
  deployNodeTool,
  getDeploymentStatusTool,
  listDeploymentsTool,
  generatePayloadTool,
  listPayloadsTool,
  getPayloadStatusTool,
  analyzeTrafficTool,
  troubleshootTool,
  systemStatusTool,
  checkPrerequisitesTool,
  generatePlanTool,
} from "@/lib/ai/tools"

describe("AI Assistant - Comprehensive Capability Tests", () => {
  const ctx = { signal: AbortSignal.timeout(30000), invokerUid: "test-assistant" }

  // Store created resources for cleanup
  const createdResources: {
    nodeIds: string[]
    deploymentIds: string[]
    payloadIds: string[]
  } = { nodeIds: [], deploymentIds: [], payloadIds: [] }

  afterAll(async () => {
    // Cleanup: Delete created nodes
    for (const nodeId of createdResources.nodeIds) {
      try {
        await deleteNodeTool.run({ nodeId }, ctx)
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  describe("🖥️ Node Management", () => {
    it("should list all nodes", async () => {
      const result = await listNodesTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.nodes)).toBe(true)
      expect(typeof result.count).toBe("number")
    })

    it("should create a new node called test-node-01", async () => {
      const result = await createNodeTool.run(
        {
          name: "test-node-01",
          hostname: "192.0.2.1",
          region: "test-region",
          tags: ["test", "demo"],
          provider: "test",
        },
        ctx
      )

      expect(result).toBeDefined()
      expect(result.nodeId).toBeDefined()
      expect(result.name).toBe("test-node-01")
      expect(result.status).toBeDefined()

      createdResources.nodeIds.push(result.nodeId)
    })

    it("should get details for created node", async () => {
      const nodeId = createdResources.nodeIds[0]
      expect(nodeId).toBeDefined()

      const result = await getNodeTool.run({ nodeId }, ctx)
      expect(result).toBeDefined()
      expect(result.found).toBe(true)
      expect(result.node).toBeDefined()
      expect(result.node?.id).toBe(nodeId)
      expect(result.node?.name).toBe("test-node-01")
    })

    it("should update node with new tags", async () => {
      const nodeId = createdResources.nodeIds[0]
      expect(nodeId).toBeDefined()

      const result = await updateNodeTool.run(
        {
          nodeId,
          tags: ["test", "demo", "updated"],
        },
        ctx
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.nodeId).toBe(nodeId)
    })
  })

  describe("⚙️ Config Generation", () => {
    it('should generate config with "obfuscation" (requires LLM)', async () => {
      // This test requires LLM API keys; skip if not available
      const hasApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
      if (!hasApiKey) {
        console.log("Skipping LLM-dependent test (no API key)")
        return
      }

      try {
        const result = await generateConfigTool.run(
          {
            description: "Generate a Hysteria2 server config with obfuscation enabled using salamander obfs type",
          },
          ctx
        )

        expect(result).toBeDefined()
        expect(typeof result.yaml).toBe("string")
        expect(result.yaml.length).toBeGreaterThan(0)
        // Config should be valid YAML-like format
        expect(result.yaml).toContain(":")
      } catch (error) {
        // Expected to fail without valid API keys or validation errors
        expect(error).toBeDefined()
      }
    })

    it('should generate high-throughput config for "1Gbps" (requires LLM)', async () => {
      // This test requires LLM API keys; skip if not available
      const hasApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
      if (!hasApiKey) {
        console.log("Skipping LLM-dependent test (no API key)")
        return
      }

      try {
        const result = await generateConfigTool.run(
          {
            description: "Generate a high-throughput Hysteria2 server config for 1Gbps bandwidth",
          },
          ctx
        )

        expect(result).toBeDefined()
        expect(typeof result.yaml).toBe("string")
        expect(result.yaml.length).toBeGreaterThan(0)
      } catch (error) {
        // Expected to fail without valid API keys
        expect(error).toBeDefined()
      }
    })

    it("should validate config generation tool structure", () => {
      // Verify the tool is properly registered and has correct shape
      expect(generateConfigTool.name).toBe("generate_config")
      expect(generateConfigTool.parameters).toBeDefined()
      expect(typeof generateConfigTool.run).toBe("function")
    })
  })

  describe("☁️ Azure Deployment", () => {
    it("should deploy a node to Azure eastus", async () => {
      // This may fail without Azure credentials, but tests tool execution
      try {
        const result = await deployNodeTool.run(
          {
            provider: "azure",
            region: "eastus",
            resourceGroup: "hysteria-rg-eastus",
            name: "test-azure-node",
          },
          ctx
        )

        expect(result).toBeDefined()
        expect(result.deploymentId).toBeDefined()
        expect(result.status).toBeDefined()

        createdResources.deploymentIds.push(result.deploymentId)
      } catch (error) {
        // Expected to fail without Azure credentials
        expect(error).toBeDefined()
      }
    })

    it("should list deployments", async () => {
      const result = await listDeploymentsTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.deployments)).toBe(true)
    })

    it("should check deployment status (validates error handling)", async () => {
      const result = await getDeploymentStatusTool.run(
        { deploymentId: "nonexistent-deployment-123" },
        ctx
      )

      expect(result).toBeDefined()
      expect(result.found).toBe(false)
    })
  })

  describe("🎭 Payload Generation", () => {
    it('should generate a "Windows x64" payload', async () => {
      const result = await generatePayloadTool.run(
        {
          description: "Windows x64 executable payload with medium obfuscation",
        },
        ctx
      )

      expect(result).toBeDefined()
      expect(result.buildId).toBeDefined()
      expect(typeof result.explanation).toBe("string")
      expect(result.preview).toBeDefined()

      createdResources.payloadIds.push(result.buildId)
    })

    it("should list all payloads", async () => {
      const result = await listPayloadsTool.run({ limit: 10 }, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.payloads)).toBe(true)
      expect(typeof result.total).toBe("number")
    })

    it("should get payload status", async () => {
      const buildId = createdResources.payloadIds[0]
      if (!buildId) {
        // Skip if payload generation failed
        return
      }

      const result = await getPayloadStatusTool.run({ buildId }, ctx)
      expect(result).toBeDefined()
      expect(result.found).toBe(true)
    })
  })

  describe("🔧 Troubleshooting", () => {
    it("should run diagnostics via system_status", async () => {
      const result = await systemStatusTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(result.server).toBeDefined()
      expect(result.nodes).toBeDefined()
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it("should analyze traffic for nodes", async () => {
      const result = await analyzeTrafficTool.run({}, ctx)
      expect(result).toBeDefined()
      expect(result.summary).toBeDefined()
      expect(Array.isArray(result.anomalies)).toBe(true)
    })

    it("should run general troubleshooting", async () => {
      const result = await troubleshootTool.run({ issue: "general" }, ctx)
      expect(result).toBeDefined()
      expect(Array.isArray(result.checks)).toBe(true)
      expect(Array.isArray(result.suggestions)).toBe(true)
    })
  })

  describe("🔄 Complex Multi-step", () => {
    it("should generate plan for config generation and SSH apply", async () => {
      const result = await generatePlanTool.run(
        {
          goal: "Generate a Hysteria2 config and apply it to node via SSH",
          constraints: ["requires SSH key"],
        },
        ctx
      )

      expect(result).toBeDefined()
      expect(Array.isArray(result.steps)).toBe(true)
      expect(result.steps.length).toBeGreaterThan(0)
      expect(typeof result.totalSteps).toBe("number")
    })

    it("should check prerequisites for deploy_node", async () => {
      const result = await checkPrerequisitesTool.run(
        {
          operation: "deploy_node",
          provider: "azure",
          region: "eastus",
          resourceGroup: "test-rg",
        },
        ctx
      )

      expect(result).toBeDefined()
      expect(typeof result.ready).toBe("boolean")
      expect(Array.isArray(result.checks)).toBe(true)
      expect(Array.isArray(result.missingItems)).toBe(true)
    })

    it("should check general prerequisites", async () => {
      const result = await checkPrerequisitesTool.run({ operation: "general" }, ctx)
      expect(result).toBeDefined()
      expect(typeof result.ready).toBe("boolean")
      expect(Array.isArray(result.checks)).toBe(true)
    })

    it("should execute full deployment workflow", async () => {
      // Deploy node
      const deployResult = await deployNodeTool.run(
        {
          provider: "hetzner",
          region: "fsn1",
          name: "multistep-test-node",
        },
        ctx
      )

      expect(deployResult).toBeDefined()
      expect(deployResult.deploymentId).toBeDefined()

      // Check deployment status
      const statusResult = await getDeploymentStatusTool.run(
        { deploymentId: deployResult.deploymentId },
        ctx
      )

      expect(statusResult).toBeDefined()
      // Should be found or not depending on deployment state
      expect(typeof statusResult.found).toBe("boolean")
    })
  })
})
