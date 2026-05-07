/**
 * Azure Node Deployment and Hysteria2 Installation Integration Test
 *
 * Prerequisites Check:
 * 1. Verify Azure credentials are configured (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID)
 * 2. Verify SSH key pair exists or generate one
 * 3. Check that resource groups exist: hysteria-rg-eastus, hysteria-rg-westeurope, hysteria-rg-australiaeast
 *
 * Test Steps:
 * 1. Deploy a test node to Azure eastus using resource group "hysteria-rg-eastus"
 * 2. Test SSH connectivity to the deployed VM
 * 3. Install Hysteria2 via SSH and verify installation
 * 4. Cleanup resources
 */

import { azureClient } from "@/lib/deploy/providers/azure"
import { generateSshKeyPair, waitForSsh, sshExec } from "@/lib/deploy/ssh"
import { buildProvisionScript } from "@/lib/deploy/provision-script"
import { randomBytes } from "node:crypto"

interface TestResult {
  phase: string
  success: boolean
  durationMs: number
  details: Record<string, unknown>
  error?: string
}

interface TestReport {
  overallSuccess: boolean
  phases: TestResult[]
  summary: {
    totalDurationMs: number
    deploymentTimeMs?: number
    sshTimeMs?: number
    installTimeMs?: number
    cleanupTimeMs?: number
  }
  recommendations: string[]
}

const TEST_CONFIG = {
  resourceGroup: "hysteria-rg-eastus",
  region: "eastus",
  vmSize: "Standard_B1s",
  vmName: `test-hysteria-${Date.now()}`,
  panelUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  port: 443,
}

const REQUIRED_ENV_VARS = [
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
]

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function log(message: string, level: "info" | "error" | "warn" = "info") {
  const timestamp = new Date().toISOString()
  const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[INFO]"
  console.log(`${timestamp} ${prefix} ${message}`)
}

/**
 * Phase 1: Verify Prerequisites
 */
async function verifyPrerequisites(): Promise<TestResult> {
  const startTime = Date.now()
  const details: Record<string, unknown> = {}
  let error: string | undefined

  log("=== Phase 1: Verifying Prerequisites ===")

  // Check environment variables
  const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v])
  if (missingVars.length > 0) {
    error = `Missing required environment variables: ${missingVars.join(", ")}`
    log(error, "error")
    return {
      phase: "prerequisites",
      success: false,
      durationMs: Date.now() - startTime,
      details,
      error,
    }
  }

  details.azureCredentialsPresent = true
  details.subscriptionId = `${process.env.AZURE_SUBSCRIPTION_ID!.slice(0, 8)}...`
  details.tenantId = `${process.env.AZURE_TENANT_ID!.slice(0, 8)}...`
  details.clientId = `${process.env.AZURE_CLIENT_ID!.slice(0, 8)}...`

  log("Azure credentials present: OK")

  // Test Azure authentication
  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          resource: "https://management.azure.com/",
        }).toString(),
      }
    )

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      error = `Azure authentication failed (${tokenRes.status}): ${text.slice(0, 300)}`
      log(error, "error")
      return {
        phase: "prerequisites",
        success: false,
        durationMs: Date.now() - startTime,
        details,
        error,
      }
    }

    const tokenData = (await tokenRes.json()) as { access_token: string }
    details.authTokenObtained = true
    details.tokenPreview = `${tokenData.access_token.slice(0, 20)}...`
    log("Azure authentication: OK")

    // Check resource group exists
    const rgRes = await fetch(
      `https://management.azure.com/subscriptions/${process.env.AZURE_SUBSCRIPTION_ID}/resourceGroups/${TEST_CONFIG.resourceGroup}?api-version=2024-07-01`,
      {
        headers: {
          authorization: `Bearer ${tokenData.access_token}`,
          "content-type": "application/json",
        },
      }
    )

    if (!rgRes.ok) {
      error = `Resource group "${TEST_CONFIG.resourceGroup}" not found or inaccessible (${rgRes.status})`
      log(error, "error")
      log(`Please create the resource group: az group create --name ${TEST_CONFIG.resourceGroup} --location ${TEST_CONFIG.region}`, "warn")
      return {
        phase: "prerequisites",
        success: false,
        durationMs: Date.now() - startTime,
        details,
        error,
      }
    }

    const rgData = (await rgRes.json()) as { name: string; location: string }
    details.resourceGroupFound = true
    details.resourceGroupName = rgData.name
    details.resourceGroupLocation = rgData.location
    log(`Resource group verified: ${rgData.name} (${rgData.location})`)

    // Check Azure provider registrations
    log("Checking Azure provider registrations...")
    const providersRes = await fetch(
      `https://management.azure.com/subscriptions/${process.env.AZURE_SUBSCRIPTION_ID}/providers?api-version=2024-07-01`,
      {
        headers: {
          authorization: `Bearer ${tokenData.access_token}`,
          "content-type": "application/json",
        },
      }
    )

    if (providersRes.ok) {
      const providersData = (await providersRes.json()) as {
        value?: Array<{ namespace: string; registrationState: string }>
      }
      const requiredProviders = ["Microsoft.Compute", "Microsoft.Network"]
      const unregistered = requiredProviders.filter((rp) => {
        const provider = providersData.value?.find((p) => p.namespace === rp)
        return !provider || provider.registrationState !== "Registered"
      })

      if (unregistered.length > 0) {
        error = `Azure subscription not registered for: ${unregistered.join(", ")}`
        log(error, "error")
        log(`To register, run: az provider register --namespace ${unregistered.join(" && az provider register --namespace ")}`, "warn")
        log("Or use Azure Portal: Subscriptions > Resource Providers > Register", "warn")
        return {
          phase: "prerequisites",
          success: false,
          durationMs: Date.now() - startTime,
          details,
          error,
        }
      }
      log("Azure provider registrations: OK")
    }
  } catch (err) {
    error = `Azure API test failed: ${err instanceof Error ? err.message : String(err)}`
    log(error, "error")
    return {
      phase: "prerequisites",
      success: false,
      durationMs: Date.now() - startTime,
      details,
      error,
    }
  }

  return {
    phase: "prerequisites",
    success: true,
    durationMs: Date.now() - startTime,
    details,
  }
}

/**
 * Phase 2: Deploy VM to Azure
 */
async function deployVM(keyPair: { publicKey: string; privateKey: string }): Promise<TestResult & { vpsId?: string; ip?: string }> {
  const startTime = Date.now()
  const details: Record<string, unknown> = {}
  let error: string | undefined
  let vpsId: string | undefined
  let ip: string | undefined

  log("\n=== Phase 2: Deploying VM to Azure ===")
  log(`Region: ${TEST_CONFIG.region}`)
  log(`VM Size: ${TEST_CONFIG.vmSize}`)
  log(`VM Name: ${TEST_CONFIG.vmName}`)
  log(`Resource Group: ${TEST_CONFIG.resourceGroup}`)

  try {
    const client = azureClient({
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      tenantId: process.env.AZURE_TENANT_ID!,
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    })

    // Create the server
    log("Creating Azure VM...")
    const createStart = Date.now()
    const result = await client.createServer({
      name: TEST_CONFIG.vmName,
      region: TEST_CONFIG.region,
      size: TEST_CONFIG.vmSize,
      sshKeyContent: keyPair.publicKey,
      resourceGroup: TEST_CONFIG.resourceGroup,
    })
    vpsId = result.vpsId
    details.vpsId = vpsId
    details.createDurationMs = Date.now() - createStart
    log(`VM creation request submitted (vpsId: ${vpsId})`)

    // Wait for IP
    log("Waiting for VM to get public IP...")
    const ipStart = Date.now()
    ip = await client.waitForIp(vpsId, 300_000) // 5 minute timeout
    details.ip = ip
    details.ipDurationMs = Date.now() - ipStart
    details.totalDeployDurationMs = Date.now() - createStart
    log(`VM is ready! IP: ${ip}`)
    log(`Deployment took ${details.totalDeployDurationMs}ms`)

  } catch (err) {
    error = `VM deployment failed: ${err instanceof Error ? err.message : String(err)}`
    log(error, "error")
    return {
      phase: "deploy_vm",
      success: false,
      durationMs: Date.now() - startTime,
      details,
      error,
      vpsId,
      ip,
    }
  }

  return {
    phase: "deploy_vm",
    success: true,
    durationMs: Date.now() - startTime,
    details,
    vpsId,
    ip,
  }
}

/**
 * Phase 3: Test SSH Connectivity
 */
async function testSSH(ip: string, privateKey: string): Promise<TestResult> {
  const startTime = Date.now()
  const details: Record<string, unknown> = {}
  let error: string | undefined

  log("\n=== Phase 3: Testing SSH Connectivity ===")
  log(`Target IP: ${ip}`)

  try {
    // Wait for SSH to be available
    log("Waiting for SSH to become available...")
    const waitStart = Date.now()
    await waitForSsh({ host: ip, privateKey, timeoutMs: 180_000 })
    details.sshWaitDurationMs = Date.now() - waitStart
    log(`SSH is ready! (waited ${details.sshWaitDurationMs}ms)`)

    // Test basic connectivity
    log("Testing basic SSH command...")
    const execStart = Date.now()
    const result = await sshExec({
      host: ip,
      privateKey,
      command: "echo 'SSH connection successful'",
      username: "azureuser",
      timeoutMs: 30_000,
    })
    details.basicCommandDurationMs = Date.now() - execStart

    if (result.code !== 0) {
      error = `SSH command failed with code ${result.code}: ${result.stderr}`
      log(error, "error")
      return {
        phase: "test_ssh",
        success: false,
        durationMs: Date.now() - startTime,
        details,
        error,
      }
    }

    details.stdout = result.stdout.trim()
    log(`SSH command output: ${result.stdout.trim()}`)

    // Check Ubuntu version
    log("Checking Ubuntu version...")
    const versionResult = await sshExec({
      host: ip,
      privateKey,
      command: "lsb_release -a 2>/dev/null || cat /etc/os-release",
      username: "azureuser",
      timeoutMs: 30_000,
    })
    details.osInfo = versionResult.stdout.trim()
    log(`OS Info:\n${versionResult.stdout.trim()}`)

  } catch (err) {
    error = `SSH test failed: ${err instanceof Error ? err.message : String(err)}`
    log(error, "error")
    return {
      phase: "test_ssh",
      success: false,
      durationMs: Date.now() - startTime,
      details,
      error,
    }
  }

  return {
    phase: "test_ssh",
    success: true,
    durationMs: Date.now() - startTime,
    details,
  }
}

/**
 * Phase 4: Install Hysteria2
 */
async function installHysteria2(ip: string, privateKey: string): Promise<TestResult> {
  const startTime = Date.now()
  const details: Record<string, unknown> = {}
  let error: string | undefined

  log("\n=== Phase 4: Installing Hysteria2 ===")

  try {
    // Generate traffic stats secret
    const trafficSecret = randomBytes(20).toString("hex")

    // Build provision script (simplified for testing)
    const script = buildProvisionScript({
      ip,
      port: TEST_CONFIG.port,
      panelUrl: TEST_CONFIG.panelUrl,
      trafficStatsSecret: trafficSecret,
    })

    details.scriptLength = script.length
    details.trafficSecretPreview = `${trafficSecret.slice(0, 10)}...`

    log(`Running provision script (${script.length} bytes)...`)
    const installStart = Date.now()

    const result = await sshExec({
      host: ip,
      privateKey,
      command: script,
      username: "azureuser",
      timeoutMs: 600_000, // 10 minutes for full install
    })

    details.installDurationMs = Date.now() - installStart
    details.exitCode = result.code
    details.stdoutPreview = result.stdout.slice(0, 500)
    details.stderrPreview = result.stderr.slice(0, 500)

    log(`Installation completed in ${details.installDurationMs}ms`)
    log(`Exit code: ${result.code}`)

    if (result.code !== 0) {
      error = `Installation script failed with code ${result.code}`
      log(`STDOUT: ${result.stdout.slice(0, 1000)}`, "error")
      log(`STDERR: ${result.stderr.slice(0, 1000)}`, "error")
      return {
        phase: "install_hysteria2",
        success: false,
        durationMs: Date.now() - startTime,
        details,
        error,
      }
    }

    log("Installation script completed successfully")

    // Verify installation
    log("Verifying Hysteria2 installation...")
    await sleep(5000) // Give service time to start

    // Check config file exists
    const configCheck = await sshExec({
      host: ip,
      privateKey,
      command: "ls -la /etc/hysteria/config.yaml && cat /etc/hysteria/config.yaml | head -20",
      username: "azureuser",
      timeoutMs: 30_000,
    })

    details.configFileExists = configCheck.code === 0
    details.configFileContent = configCheck.code === 0 ? configCheck.stdout : configCheck.stderr

    if (configCheck.code !== 0) {
      log("Config file not found - installation may have failed", "warn")
    } else {
      log("Config file exists: OK")
    }

    // Check service status
    const serviceCheck = await sshExec({
      host: ip,
      privateKey,
      command: "systemctl is-active hysteria-server && systemctl status hysteria-server --no-pager",
      username: "azureuser",
      timeoutMs: 30_000,
    })

    details.serviceActive = serviceCheck.stdout.includes("active")
    details.serviceStatus = serviceCheck.stdout.slice(0, 500)

    if (details.serviceActive) {
      log("Hysteria2 service is active: OK")
    } else {
      log("Hysteria2 service is not active - checking logs...", "warn")
      const logs = await sshExec({
        host: ip,
        privateKey,
        command: "journalctl -u hysteria-server --no-pager -n 50 || cat /var/log/syslog | grep hysteria | tail -20",
        username: "azureuser",
        timeoutMs: 30_000,
      })
      details.serviceLogs = logs.stdout.slice(0, 1000)
      log(`Service logs:\n${logs.stdout.slice(0, 1000)}`)
    }

    // Check binary exists and get version
    const versionCheck = await sshExec({
      host: ip,
      privateKey,
      command: "/usr/local/bin/hysteria version 2>/dev/null || echo 'binary check failed'",
      username: "azureuser",
      timeoutMs: 30_000,
    })

    details.binaryVersion = versionCheck.stdout.trim()
    log(`Hysteria2 version: ${versionCheck.stdout.trim()}`)

  } catch (err) {
    error = `Hysteria2 installation failed: ${err instanceof Error ? err.message : String(err)}`
    log(error, "error")
    return {
      phase: "install_hysteria2",
      success: false,
      durationMs: Date.now() - startTime,
      details,
      error,
    }
  }

  return {
    phase: "install_hysteria2",
    success: true,
    durationMs: Date.now() - startTime,
    details,
  }
}

/**
 * Phase 5: Cleanup Resources
 */
async function cleanup(vpsId: string): Promise<TestResult> {
  const startTime = Date.now()
  const details: Record<string, unknown> = {}
  let error: string | undefined

  log("\n=== Phase 5: Cleanup ===")
  log(`Destroying VM (vpsId: ${vpsId})...`)

  try {
    const client = azureClient({
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
      tenantId: process.env.AZURE_TENANT_ID!,
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    })

    const destroyStart = Date.now()
    await client.destroyServer(vpsId)
    details.destroyDurationMs = Date.now() - destroyStart

    log(`Cleanup completed in ${details.destroyDurationMs}ms`)

  } catch (err) {
    error = `Cleanup failed: ${err instanceof Error ? err.message : String(err)}`
    log(error, "error")
    return {
      phase: "cleanup",
      success: false,
      durationMs: Date.now() - startTime,
      details,
      error,
    }
  }

  return {
    phase: "cleanup",
    success: true,
    durationMs: Date.now() - startTime,
    details,
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<TestReport> {
  const overallStart = Date.now()
  const phases: TestResult[] = []
  const recommendations: string[] = []

  log("=".repeat(60))
  log("AZURE NODE DEPLOYMENT & HYSTERIA2 INSTALLATION TEST")
  log("=".repeat(60))

  // Phase 1: Prerequisites
  const prereqResult = await verifyPrerequisites()
  phases.push(prereqResult)

  if (!prereqResult.success) {
    if (prereqResult.error?.includes("not registered")) {
      recommendations.push("Register Azure resource providers: az provider register --namespace Microsoft.Compute --namespace Microsoft.Network")
    } else {
      recommendations.push("Fix Azure credentials before running deployment tests")
    }
    return {
      overallSuccess: false,
      phases,
      summary: { totalDurationMs: Date.now() - overallStart },
      recommendations,
    }
  }

  // Generate SSH key pair
  log("\nGenerating SSH key pair...")
  const keyPair = generateSshKeyPair()
  log(`SSH key pair generated (public key length: ${keyPair.publicKey.length})`)

  // Phase 2: Deploy VM
  const deployResult = await deployVM(keyPair)
  phases.push(deployResult)

  if (!deployResult.success || !deployResult.ip || !deployResult.vpsId) {
    recommendations.push("Check Azure resource group permissions and quota")
    return {
      overallSuccess: false,
      phases,
      summary: {
        totalDurationMs: Date.now() - overallStart,
        deploymentTimeMs: deployResult.durationMs,
      },
      recommendations,
    }
  }

  // Phase 3: Test SSH
  const sshResult = await testSSH(deployResult.ip, keyPair.privateKey)
  phases.push(sshResult)

  if (!sshResult.success) {
    recommendations.push("Check NSG rules allow SSH (port 22)")
    recommendations.push("Verify VM booted successfully in Azure Portal")
    // Continue to cleanup
  }

  // Phase 4: Install Hysteria2 (only if SSH succeeded)
  let installResult: TestResult | undefined
  if (sshResult.success) {
    installResult = await installHysteria2(deployResult.ip, keyPair.privateKey)
    phases.push(installResult)

    if (!installResult.success) {
      recommendations.push("Check provision script for errors")
      recommendations.push("Verify network connectivity to GitHub for binary download")
    }
  }

  // Phase 5: Cleanup (always run)
  const cleanupResult = await cleanup(deployResult.vpsId)
  phases.push(cleanupResult)

  if (!cleanupResult.success) {
    recommendations.push("Manually cleanup resources in Azure Portal if needed")
  }

  // Calculate summary
  const totalDuration = Date.now() - overallStart
  const summary = {
    totalDurationMs: totalDuration,
    deploymentTimeMs: deployResult.details.totalDeployDurationMs as number | undefined,
    sshTimeMs: sshResult.details.sshWaitDurationMs as number | undefined,
    installTimeMs: installResult?.details.installDurationMs as number | undefined,
    cleanupTimeMs: cleanupResult.details.destroyDurationMs as number | undefined,
  }

  // Overall success if all phases succeeded
  const overallSuccess = phases.every((p) => p.success)

  return {
    overallSuccess,
    phases,
    summary,
    recommendations,
  }
}

/**
 * Print test report
 */
function printReport(report: TestReport): void {
  log("\n" + "=".repeat(60))
  log("TEST REPORT")
  log("=".repeat(60))

  log(`\nOverall Success: ${report.overallSuccess ? "YES" : "NO"}`)
  log(`Total Duration: ${(report.summary.totalDurationMs / 1000).toFixed(2)}s`)

  log("\n--- Phase Results ---")
  for (const phase of report.phases) {
    const status = phase.success ? "PASS" : "FAIL"
    const duration = (phase.durationMs / 1000).toFixed(2)
    log(`  ${phase.phase}: ${status} (${duration}s)`)
    if (phase.error) {
      log(`    Error: ${phase.error}`, "error")
    }
  }

  log("\n--- Timing Summary ---")
  if (report.summary.deploymentTimeMs) {
    log(`  VM Deployment: ${(report.summary.deploymentTimeMs / 1000).toFixed(2)}s`)
  }
  if (report.summary.sshTimeMs) {
    log(`  SSH Wait: ${(report.summary.sshTimeMs / 1000).toFixed(2)}s`)
  }
  if (report.summary.installTimeMs) {
    log(`  Hysteria2 Install: ${(report.summary.installTimeMs / 1000).toFixed(2)}s`)
  }
  if (report.summary.cleanupTimeMs) {
    log(`  Cleanup: ${(report.summary.cleanupTimeMs / 1000).toFixed(2)}s`)
  }

  if (report.recommendations.length > 0) {
    log("\n--- Recommendations ---")
    for (const rec of report.recommendations) {
      log(`  • ${rec}`, "warn")
    }
  }

  log("\n" + "=".repeat(60))
}

// Run tests
runTests()
  .then((report) => {
    printReport(report)
    process.exit(report.overallSuccess ? 0 : 1)
  })
  .catch((err) => {
    log(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`, "error")
    process.exit(1)
  })
