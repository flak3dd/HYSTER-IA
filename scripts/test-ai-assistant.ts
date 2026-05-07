#!/usr/bin/env ts-node
/**
 * Comprehensive AI Assistant Test Suite
 *
 * Tests all AI tool capabilities across the following categories:
 * 1. Node Management
 * 2. Config Generation
 * 3. Azure Deployment
 * 4. Payload Generation
 * 5. Troubleshooting
 * 6. Complex Multi-step
 *
 * Run with: npx ts-node scripts/test-ai-assistant.ts
 */

import {
  AI_TOOLS,
  listNodesTool,
  createNodeTool,
  getNodeTool,
  updateNodeTool,
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

interface TestResult {
  category: string
  prompt: string
  toolName: string
  input: Record<string, unknown>
  success: boolean
  responseTime: number
  result?: unknown
  error?: {
    type: string
    message: string
    stack?: string
  }
}

interface TestSummary {
  totalTests: number
  passed: number
  failed: number
  totalResponseTime: number
  avgResponseTime: number
  errorsByCategory: Record<string, number>
  results: TestResult[]
}

// Test context
const testCtx = {
  signal: AbortSignal.timeout(60000),
  invokerUid: "test-assistant",
}

// Store created test resources for cleanup
const createdResources = {
  nodeIds: [] as string[],
  deploymentIds: [] as string[],
  payloadIds: [] as string[],
}

async function runTest(
  category: string,
  prompt: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<TestResult> {
  const startTime = performance.now()
  const tool = (AI_TOOLS as Record<string, { run?: (input: unknown, ctx: unknown) => Promise<unknown> }>)[toolName]

  try {
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in AI_TOOLS`)
    }

    if (!tool.run) {
      throw new Error(`Tool "${toolName}" has no run method`)
    }

    const result = await tool.run(input, testCtx)
    const responseTime = performance.now() - startTime

    return {
      category,
      prompt,
      toolName,
      input,
      success: true,
      responseTime,
      result,
    }
  } catch (err) {
    const responseTime = performance.now() - startTime
    const error = err as Error

    return {
      category,
      prompt,
      toolName,
      input,
      success: false,
      responseTime,
      error: {
        type: error.name,
        message: error.message,
        stack: error.stack,
      },
    }
  }
}

// ==================== TEST SUITES ====================

async function testNodeManagement(): Promise<TestResult[]> {
  console.log("\n🧪 Testing Node Management...")
  const results: TestResult[] = []

  // Test 1: List all nodes
  results.push(
    await runTest(
      "Node Management",
      "List all nodes",
      "list_nodes",
      {}
    )
  )

  // Test 2: Create a new node
  const createResult = await runTest(
    "Node Management",
    "Create a new node called test-node-01",
    "create_node",
    {
      name: "test-node-01",
      hostname: "192.0.2.1", // TEST-NET-1 IP (non-routable)
      region: "test-region",
      tags: ["test", "demo"],
      provider: "test",
    }
  )
  results.push(createResult)

  // Store node ID for subsequent tests
  let testNodeId: string | undefined
  if (createResult.success && createResult.result) {
    const result = createResult.result as { nodeId?: string }
    if (result.nodeId) {
      testNodeId = result.nodeId
      createdResources.nodeIds.push(testNodeId)
    }
  }

  // Test 3: Get node details (if we have a node ID)
  if (testNodeId) {
    results.push(
      await runTest(
        "Node Management",
        `Get details for node ${testNodeId}`,
        "get_node",
        { nodeId: testNodeId }
      )
    )

    // Test 4: Update node
    results.push(
      await runTest(
        "Node Management",
        `Update node ${testNodeId} with tags [test, demo, updated]`,
        "update_node",
        {
          nodeId: testNodeId,
          tags: ["test", "demo", "updated"],
        }
      )
    )
  } else {
    // Skip tests if node creation failed
    results.push({
      category: "Node Management",
      prompt: "Get details for node [skipped - no node created]",
      toolName: "get_node",
      input: {},
      success: false,
      responseTime: 0,
      error: { type: "Skipped", message: "Node creation failed, skipping dependent test" },
    })
    results.push({
      category: "Node Management",
      prompt: "Update node [skipped - no node created]",
      toolName: "update_node",
      input: {},
      success: false,
      responseTime: 0,
      error: { type: "Skipped", message: "Node creation failed, skipping dependent test" },
    })
  }

  return results
}

async function testConfigGeneration(): Promise<TestResult[]> {
  console.log("\n🧪 Testing Config Generation...")
  const results: TestResult[] = []

  // Test 1: Generate config with obfuscation
  results.push(
    await runTest(
      "Config Generation",
      "Generate a Hysteria2 config with obfuscation",
      "generate_config",
      {
        description: "Generate a Hysteria2 server config with obfuscation enabled using salamander obfs type",
      }
    )
  )

  // Test 2: Generate high-throughput config
  results.push(
    await runTest(
      "Config Generation",
      "Generate a high-throughput config for 1Gbps",
      "generate_config",
      {
        description: "Generate a high-throughput Hysteria2 server config for 1Gbps bandwidth with optimized settings",
      }
    )
  )

  return results
}

async function testAzureDeployment(): Promise<TestResult[]> {
  console.log("\n🧪 Testing Azure Deployment...")
  const results: TestResult[] = []

  // Test 1: Deploy node to Azure
  // Note: This will likely fail without Azure credentials, but we test the tool execution
  const deployResult = await runTest(
    "Azure Deployment",
    "Deploy a node to Azure eastus with resourceGroup hysteria-rg-eastus",
    "deploy_node",
    {
      provider: "azure",
      region: "eastus",
      resourceGroup: "hysteria-rg-eastus",
      name: "test-azure-node",
    }
  )
  results.push(deployResult)

  // Store deployment ID if created
  let deploymentId: string | undefined
  if (deployResult.success && deployResult.result) {
    const result = deployResult.result as { deploymentId?: string }
    if (result.deploymentId) {
      deploymentId = result.deploymentId
      createdResources.deploymentIds.push(deploymentId)
    }
  }

  // Test 2: List deployments
  results.push(
    await runTest(
      "Azure Deployment",
      "List all deployments",
      "list_deployments",
      {}
    )
  )

  // Test 3: Check deployment status (if we have a deployment ID)
  if (deploymentId) {
    results.push(
      await runTest(
        "Azure Deployment",
        "Check deployment status",
        "get_deployment_status",
        { deploymentId }
      )
    )
  } else {
    // Test with a fake deployment ID to test error handling
    results.push(
      await runTest(
        "Azure Deployment",
        "Check deployment status (with invalid ID)",
        "get_deployment_status",
        { deploymentId: "nonexistent-deployment-123" }
      )
    )
  }

  return results
}

async function testPayloadGeneration(): Promise<TestResult[]> {
  console.log("\n🧪 Testing Payload Generation...")
  const results: TestResult[] = []

  // Test 1: Generate Windows x64 payload
  const generateResult = await runTest(
    "Payload Generation",
    "Generate a Windows x64 payload",
    "generate_payload",
    {
      description: "Windows x64 executable payload with medium obfuscation for red team testing",
    }
  )
  results.push(generateResult)

  // Store build ID if created
  let buildId: string | undefined
  if (generateResult.success && generateResult.result) {
    const result = generateResult.result as { buildId?: string }
    if (result.buildId) {
      buildId = result.buildId
      createdResources.payloadIds.push(buildId)
    }
  }

  // Test 2: List all payloads
  results.push(
    await runTest(
      "Payload Generation",
      "List all payloads",
      "list_payloads",
      { limit: 10 }
    )
  )

  // Test 3: Get payload status (if we have a build ID)
  if (buildId) {
    results.push(
      await runTest(
        "Payload Generation",
        "Get payload status",
        "get_payload_status",
        { buildId }
      )
    )
  } else {
    results.push({
      category: "Payload Generation",
      prompt: "Get payload status [skipped - no payload generated]",
      toolName: "get_payload_status",
      input: {},
      success: false,
      responseTime: 0,
      error: { type: "Skipped", message: "Payload generation failed, skipping status check" },
    })
  }

  return results
}

async function testTroubleshooting(): Promise<TestResult[]> {
  console.log("\n🧪 Testing Troubleshooting...")
  const results: TestResult[] = []

  // Test 1: System status (for diagnostics)
  results.push(
    await runTest(
      "Troubleshooting",
      "Run diagnostics on all nodes (system status)",
      "system_status",
      {}
    )
  )

  // Test 2: Analyze traffic
  results.push(
    await runTest(
      "Troubleshooting",
      "Analyze traffic for all nodes",
      "analyze_traffic",
      {}
    )
  )

  // Test 3: Troubleshoot (if there's a node to troubleshoot)
  results.push(
    await runTest(
      "Troubleshooting",
      "Run general troubleshooting",
      "troubleshoot",
      {
        scope: "general",
      }
    )
  )

  return results
}

async function testComplexMultiStep(): Promise<TestResult[]> {
  console.log("\n🧪 Testing Complex Multi-step Operations...")
  const results: TestResult[] = []

  // Create a node for multi-step test
  const createNodeResult = await runTest(
    "Complex Multi-step",
    "Create node for multi-step test",
    "create_node",
    {
      name: "multistep-test-node",
      hostname: "192.0.2.2",
      region: "test-region",
      tags: ["multistep", "test"],
    }
  )

  let nodeId: string | undefined
  if (createNodeResult.success && createNodeResult.result) {
    const result = createNodeResult.result as { nodeId?: string }
    nodeId = result.nodeId
    if (nodeId) {
      createdResources.nodeIds.push(nodeId)
    }
  }

  // Test 1: Generate plan (simulating "generate config and apply")
  results.push(
    await runTest(
      "Complex Multi-step",
      "Generate a config and apply it to node via SSH",
      "generate_plan",
      {
        goal: "Generate a Hysteria2 config and apply it to node via SSH",
        constraints: ["requires SSH key"],
      }
    )
  )

  // Test 2: Check prerequisites for deployment
  results.push(
    await runTest(
      "Complex Multi-step",
      "Check prerequisites for deploy_node",
      "check_prerequisites",
      {
        operation: "deploy_node",
        provider: "azure",
        region: "eastus",
        resourceGroup: "test-rg",
      }
    )
  )

  // Test 3: Full deployment workflow (deploy, then check)
  const deployResult = await runTest(
    "Complex Multi-step",
    "Deploy a node, generate a config, and apply it",
    "deploy_node",
    {
      provider: "hetzner",
      region: "fsn1",
      name: "multistep-deploy-test",
    }
  )
  results.push(deployResult)

  if (deployResult.success && deployResult.result) {
    const result = deployResult.result as { deploymentId?: string }
    if (result.deploymentId) {
      createdResources.deploymentIds.push(result.deploymentId)

      // Check deployment status
      results.push(
        await runTest(
          "Complex Multi-step",
          "Check status of multi-step deployment",
          "get_deployment_status",
          { deploymentId: result.deploymentId }
        )
      )
    }
  }

  return results
}

// ==================== CLEANUP ====================

async function cleanup() {
  console.log("\n🧹 Cleaning up test resources...")

  // Clean up nodes
  for (const nodeId of createdResources.nodeIds) {
    try {
      const tool = (AI_TOOLS as Record<string, { run?: (input: unknown, ctx: unknown) => Promise<unknown> }>)["delete_node"]
      if (tool?.run) {
        await tool.run({ nodeId }, testCtx)
        console.log(`  ✅ Deleted node: ${nodeId}`)
      }
    } catch (err) {
      console.log(`  ⚠️ Failed to delete node ${nodeId}: ${(err as Error).message}`)
    }
  }

  // Clean up payloads
  for (const buildId of createdResources.payloadIds) {
    try {
      const tool = (AI_TOOLS as Record<string, { run?: (input: unknown, ctx: unknown) => Promise<unknown> }>)["delete_payload"]
      if (tool?.run) {
        await tool.run({ buildId }, testCtx)
        console.log(`  ✅ Deleted payload: ${buildId}`)
      }
    } catch (err) {
      console.log(`  ⚠️ Failed to delete payload ${buildId}: ${(err as Error).message}`)
    }
  }

  console.log("✅ Cleanup complete")
}

// ==================== MAIN ====================

async function main() {
  console.log("=".repeat(80))
  console.log("🤖 AI ASSISTANT COMPREHENSIVE TEST SUITE")
  console.log("=".repeat(80))
  console.log(`\n⏱️  Test started at: ${new Date().toISOString()}`)
  console.log(`📝 Available tools: ${Object.keys(AI_TOOLS).length}`)

  const allResults: TestResult[] = []

  try {
    // Run all test suites
    allResults.push(...(await testNodeManagement()))
    allResults.push(...(await testConfigGeneration()))
    allResults.push(...(await testAzureDeployment()))
    allResults.push(...(await testPayloadGeneration()))
    allResults.push(...(await testTroubleshooting()))
    allResults.push(...(await testComplexMultiStep()))

    // Calculate summary
    const summary: TestSummary = {
      totalTests: allResults.length,
      passed: allResults.filter((r) => r.success).length,
      failed: allResults.filter((r) => !r.success).length,
      totalResponseTime: allResults.reduce((acc, r) => acc + r.responseTime, 0),
      avgResponseTime: 0,
      errorsByCategory: {},
      results: allResults,
    }
    summary.avgResponseTime = summary.totalResponseTime / summary.totalTests

    // Count errors by category
    for (const result of allResults) {
      if (!result.success && result.error) {
        summary.errorsByCategory[result.category] = (summary.errorsByCategory[result.category] || 0) + 1
      }
    }

    // Print detailed results
    console.log("\n" + "=".repeat(80))
    console.log("📊 DETAILED TEST RESULTS")
    console.log("=".repeat(80))

    for (const result of allResults) {
      const status = result.success ? "✅ PASS" : "❌ FAIL"
      console.log(`\n${status} [${result.category}] ${result.prompt}`)
      console.log(`   Tool: ${result.toolName}`)
      console.log(`   Response time: ${result.responseTime.toFixed(2)}ms`)

      if (result.success) {
        // Truncate result for display
        const resultStr = JSON.stringify(result.result).slice(0, 200)
        console.log(`   Result: ${resultStr}${resultStr.length >= 200 ? "..." : ""}`)
      } else if (result.error) {
        console.log(`   Error: ${result.error.type}: ${result.error.message}`)
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(80))
    console.log("📈 TEST SUMMARY")
    console.log("=".repeat(80))
    console.log(`Total tests run:     ${summary.totalTests}`)
    console.log(`Tests passed:        ${summary.passed} (${((summary.passed / summary.totalTests) * 100).toFixed(1)}%)`)
    console.log(`Tests failed:        ${summary.failed} (${((summary.failed / summary.totalTests) * 100).toFixed(1)}%)`)
    console.log(`Total response time: ${summary.totalResponseTime.toFixed(2)}ms`)
    console.log(`Avg response time:   ${summary.avgResponseTime.toFixed(2)}ms`)

    if (Object.keys(summary.errorsByCategory).length > 0) {
      console.log("\n❌ Errors by category:")
      for (const [category, count] of Object.entries(summary.errorsByCategory)) {
        console.log(`  - ${category}: ${count}`)
      }
    }

    // Check for specific error types
    const jsonParseErrors = allResults.filter(
      (r) => !r.success && r.error?.message.includes("JSON")
    )
    const providerErrors = allResults.filter(
      (r) => !r.success && (r.error?.message.includes("provider") || r.error?.message.includes("Azure") || r.error?.message.includes("credentials"))
    )
    const timeoutErrors = allResults.filter(
      (r) => !r.success && (r.error?.message.includes("timeout") || r.error?.message.includes("abort"))
    )
    const validationErrors = allResults.filter(
      (r) => !r.success && r.error?.message.includes("validation")
    )

    console.log("\n🔍 Error Analysis:")
    console.log(`  JSON parsing errors:  ${jsonParseErrors.length}`)
    console.log(`  Provider errors:      ${providerErrors.length}`)
    console.log(`  Timeout errors:       ${timeoutErrors.length}`)
    console.log(`  Validation errors:    ${validationErrors.length}`)

    if (providerErrors.length > 0) {
      console.log("\n  Provider error details:")
      for (const err of providerErrors) {
        console.log(`    - [${err.category}] ${err.toolName}: ${err.error?.message.slice(0, 100)}`)
      }
    }

    // Final status
    console.log("\n" + "=".repeat(80))
    if (summary.failed === 0) {
      console.log("🎉 ALL TESTS PASSED!")
    } else if (summary.passed / summary.totalTests >= 0.8) {
      console.log("⚠️  MOST TESTS PASSED (some failures expected due to missing credentials/config)")
    } else {
      console.log("🚨 SIGNIFICANT TEST FAILURES - Review required")
    }
    console.log("=".repeat(80))

    // Cleanup
    await cleanup()

    // Exit with appropriate code
    process.exit(summary.failed > 0 ? 1 : 0)
  } catch (err) {
    console.error("\n💥 Fatal error during test execution:", err)
    await cleanup()
    process.exit(1)
  }
}

// Run the test suite
main()
