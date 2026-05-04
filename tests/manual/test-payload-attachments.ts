#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

/**
 * Payload Attachment Test Suite
 * Tests the new payload attachment functionality for Hysteria tunnel configurations
 */

import {
  createConfigPayload,
  createSetupScriptPayload,
  createEnvPayload,
  createReadmePayload,
  createBinaryPayload,
  PayloadTemplates,
  type PayloadAttachment,
} from "../../mailer-service/index"

interface TestResult {
  passed: boolean
  message: string
}

class PayloadAttachmentTestSuite {
  private results: Map<string, TestResult> = new Map()

  async runAllTests(): Promise<void> {
    console.log("🚀 Starting Payload Attachment Test Suite...\n")

    // Test 1: Config payload creation
    this.testConfigPayload()

    // Test 2: Setup script payload creation
    this.testSetupScriptPayload()

    // Test 3: Environment variables payload
    this.testEnvPayload()

    // Test 4: README payload
    this.testReadmePayload()

    // Test 5: Binary payload
    this.testBinaryPayload()

    // Test 6: Persistence template (Linux)
    this.testPersistenceTemplateLinux()

    // Test 7: Persistence template (Windows)
    this.testPersistenceTemplateWindows()

    // Test 8: Monitoring template
    this.testMonitoringTemplate()

    // Test 9: Cleanup template (Linux)
    this.testCleanupTemplateLinux()

    // Test 10: Documentation template
    this.testDocumentationTemplate()

    // Print results
    this.printResults()
  }

  private testConfigPayload(): void {
    console.log("📋 Testing Config Payload Creation...")

    try {
      const config = {
        server: "test.example.com:443",
        auth: "test-password",
        obfs: { type: "salamander" },
      }

      const payload = createConfigPayload("test-config.json", config, "Test configuration")

      this.assert(payload.filename === "test-config.json", "Filename set correctly")
      this.assert(payload.contentType === "application/json", "Content type is JSON")
      this.assert(payload.description === "Test configuration", "Description set correctly")
      this.assert(typeof payload.content === "string", "Content is string")
      
      // Verify JSON is valid
      const parsed = JSON.parse(payload.content as string)
      this.assert(parsed.server === config.server, "Config content is valid JSON")

      this.results.set("config-payload", {
        passed: true,
        message: "Config payload creation working correctly",
      })
    } catch (error) {
      this.results.set("config-payload", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Config Payload test completed\n")
  }

  private testSetupScriptPayload(): void {
    console.log("🔧 Testing Setup Script Payload Creation...")

    try {
      const commands = [
        "echo 'Setting up environment'",
        "mkdir -p /tmp/test",
        "chmod +x script.sh",
      ]

      const payloadLinux = createSetupScriptPayload(commands, "linux", "Linux setup")
      this.assert(payloadLinux.filename === "setup.sh", "Linux script filename correct")
      this.assert(payloadLinux.contentType === "text/x-sh", "Linux content type correct")
      this.assert((payloadLinux.content as string).includes("#!/bin/bash"), "Linux shebang present")

      const payloadWindows = createSetupScriptPayload(commands, "windows", "Windows setup")
      this.assert(payloadWindows.filename === "setup.ps1", "Windows script filename correct")
      this.assert(payloadWindows.contentType === "text/plain", "Windows content type correct")
      this.assert((payloadWindows.content as string).includes("# PowerShell script"), "Windows shebang present")

      this.results.set("setup-script-payload", {
        passed: true,
        message: "Setup script payload creation working for both platforms",
      })
    } catch (error) {
      this.results.set("setup-script-payload", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Setup Script Payload test completed\n")
  }

  private testEnvPayload(): void {
    console.log("🌍 Testing Environment Variables Payload Creation...")

    try {
      const envVars = {
        API_KEY: "test-key-123",
        SERVER_URL: "https://api.example.com",
        DEBUG: "false",
      }

      const payload = createEnvPayload(envVars, "Test environment variables")

      this.assert(payload.filename === ".env.payload", "Filename correct")
      this.assert(payload.contentType === "text/plain", "Content type correct")
      this.assert((payload.content as string).includes("export API_KEY"), "Export statement present")
      this.assert((payload.content as string).includes("test-key-123"), "Value present")

      this.results.set("env-payload", {
        passed: true,
        message: "Environment variables payload creation working correctly",
      })
    } catch (error) {
      this.results.set("env-payload", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Environment Variables Payload test completed\n")
  }

  private testReadmePayload(): void {
    console.log("📖 Testing README Payload Creation...")

    try {
      const content = "This is test documentation content."
      const payload = createReadmePayload(content, "Test documentation")

      this.assert(payload.filename === "README.md", "Filename correct")
      this.assert(payload.contentType === "text/markdown", "Content type correct")
      this.assert((payload.content as string).includes("# Tunnel Configuration Documentation"), "Header present")
      this.assert((payload.content as string).includes(content), "Content present")

      this.results.set("readme-payload", {
        passed: true,
        message: "README payload creation working correctly",
      })
    } catch (error) {
      this.results.set("readme-payload", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ README Payload test completed\n")
  }

  private testBinaryPayload(): void {
    console.log("📦 Testing Binary Payload Creation...")

    try {
      const testData = "test binary data"
      const base64Data = Buffer.from(testData).toString("base64")
      const payload = createBinaryPayload("test.bin", base64Data, "Test binary")

      this.assert(payload.filename === "test.bin", "Filename correct")
      this.assert(payload.contentType === "application/octet-stream", "Content type correct")
      this.assert(Buffer.isBuffer(payload.content), "Content is Buffer")
      this.assert((payload.content as Buffer).toString() === testData, "Binary data decoded correctly")

      this.results.set("binary-payload", {
        passed: true,
        message: "Binary payload creation working correctly",
      })
    } catch (error) {
      this.results.set("binary-payload", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Binary Payload test completed\n")
  }

  private testPersistenceTemplateLinux(): void {
    console.log("🔄 Testing Persistence Template (Linux)...")

    try {
      const payload = PayloadTemplates.persistence("linux")

      this.assert(payload.filename === "setup.sh", "Filename correct")
      this.assert(payload.description === "Auto-start configuration", "Description correct")
      this.assert((payload.content as string).includes("crontab"), "Crontab command present")
      this.assert((payload.content as string).includes("@reboot"), "Reboot command present")

      this.results.set("persistence-template-linux", {
        passed: true,
        message: "Linux persistence template working correctly",
      })
    } catch (error) {
      this.results.set("persistence-template-linux", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Persistence Template (Linux) test completed\n")
  }

  private testPersistenceTemplateWindows(): void {
    console.log("🪟 Testing Persistence Template (Windows)...")

    try {
      const payload = PayloadTemplates.persistence("windows")

      this.assert(payload.filename === "setup.ps1", "Filename correct")
      this.assert(payload.description === "Windows persistence script", "Description correct")
      this.assert((payload.content as string).includes("WScript.Shell"), "PowerShell script correct")
      this.assert((payload.content as string).includes("Startup"), "Startup folder reference present")

      this.results.set("persistence-template-windows", {
        passed: true,
        message: "Windows persistence template working correctly",
      })
    } catch (error) {
      this.results.set("persistence-template-windows", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Persistence Template (Windows) test completed\n")
  }

  private testMonitoringTemplate(): void {
    console.log("📊 Testing Monitoring Template...")

    try {
      const payload = PayloadTemplates.monitoring()

      this.assert(payload.filename === "setup.sh", "Filename correct")
      this.assert(payload.description === "Monitoring and auto-restart script", "Description correct")
      this.assert((payload.content as string).includes("monitor.sh"), "Monitor script present")
      this.assert((payload.content as string).includes("while true"), "Loop present")
      this.assert((payload.content as string).includes("pgrep"), "Process check present")

      this.results.set("monitoring-template", {
        passed: true,
        message: "Monitoring template working correctly",
      })
    } catch (error) {
      this.results.set("monitoring-template", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Monitoring Template test completed\n")
  }

  private testCleanupTemplateLinux(): void {
    console.log("🧹 Testing Cleanup Template (Linux)...")

    try {
      const payload = PayloadTemplates.cleanup("linux")

      this.assert(payload.filename === "setup.sh", "Filename correct")
      this.assert(payload.description === "Cleanup script", "Description correct")
      this.assert((payload.content as string).includes("pkill"), "Process kill present")
      this.assert((payload.content as string).includes("rm -f"), "File removal present")

      this.results.set("cleanup-template-linux", {
        passed: true,
        message: "Linux cleanup template working correctly",
      })
    } catch (error) {
      this.results.set("cleanup-template-linux", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Cleanup Template (Linux) test completed\n")
  }

  private testDocumentationTemplate(): void {
    console.log("📚 Testing Documentation Template...")

    try {
      const payload = PayloadTemplates.documentation()

      this.assert(payload.filename === "README.md", "Filename correct")
      this.assert(payload.description === "Usage documentation", "Description correct")
      this.assert((payload.content as string).includes("## Usage Instructions"), "Usage section present")
      this.assert((payload.content as string).includes("### Quick Start"), "Quick start section present")
      this.assert((payload.content as string).includes("### Troubleshooting"), "Troubleshooting section present")

      this.results.set("documentation-template", {
        passed: true,
        message: "Documentation template working correctly",
      })
    } catch (error) {
      this.results.set("documentation-template", {
        passed: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    console.log("✅ Documentation Template test completed\n")
  }

  private assert(condition: any, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`)
    }
  }

  private printResults(): void {
    console.log("\n" + "=".repeat(60))
    console.log("📊 PAYLOAD ATTACHMENT TEST RESULTS")
    console.log("=".repeat(60) + "\n")

    let passed = 0
    let failed = 0

    for (const [testName, result] of this.results.entries()) {
      const status = result.passed ? "✅ PASSED" : "❌ FAILED"
      console.log(`${status} - ${testName}`)
      console.log(`   ${result.message}\n`)

      if (result.passed) {
        passed++
      } else {
        failed++
      }
    }

    console.log("=".repeat(60))
    console.log(`Total: ${this.results.size} tests | Passed: ${passed} | Failed: ${failed}`)
    console.log("=".repeat(60))

    if (failed === 0) {
      console.log("\n🎉 All payload attachment tests passed successfully!")
    } else {
      console.log(`\n⚠️ ${failed} test(s) failed. Please review the errors above.`)
    }
  }
}

// Run the test suite
const testSuite = new PayloadAttachmentTestSuite()
testSuite.runAllTests().catch((error) => {
  console.error("Fatal error running test suite:", error)
  process.exit(1)
})