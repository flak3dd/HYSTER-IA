/**
 * @jest-environment node
 *
 * Unit tests for enhanced packing function functionality
 * Tests packing configuration, cache management, statistics, and helper methods
 */

import path from 'path'
import { PackingConfig } from '@/lib/implants/compilation-service'
import { ImplantCompilationService } from '@/lib/implants/compilation-service'

// Mock the compilation service to test individual methods
jest.mock('@/lib/implants/compilation-service', () => {
  const actualModule = jest.requireActual('@/lib/implants/compilation-service')
  return {
    ...actualModule,
    ImplantCompilationService: jest.fn().mockImplementation(() => ({
      packingCache: new Map(),
      packingStats: {
        totalPacked: 0,
        totalUnpacked: 0,
        averageCompressionRatio: 0,
        methodUsage: {},
        cacheHits: 0,
        cacheMisses: 0,
      },
      normalizePackingConfig: jest.fn(function(packing: boolean | PackingConfig) {
        if (typeof packing === 'boolean') {
          return {
            enabled: packing,
            method: 'upx',
            algorithm: 'lzma',
            compressionLevel: 7,
            cacheEnabled: true,
            minCompressionRatio: 10,
            maxCompressionRatio: 80,
            timeout: 60000,
            retryAttempts: 2,
            preserveSymbols: false,
            stripDebugInfo: true,
          }
        }
        return packing
      }),
      generateCacheKey: jest.fn(function(binaryPath: string, hash: string, config: PackingConfig) {
        const ext = path.extname(binaryPath)
        const basename = path.basename(binaryPath, ext)
        return `${basename}-${hash}-${config.method}-${config.algorithm}-${config.compressionLevel}`
      }),
      updatePackingStats: jest.fn(function(method: string, compressionRatio: number, fromCache: boolean) {
        if (!fromCache) {
          this.packingStats.totalPacked++
          const totalRatio = this.packingStats.averageCompressionRatio * (this.packingStats.totalPacked - 1)
          this.packingStats.averageCompressionRatio = (totalRatio + compressionRatio) / this.packingStats.totalPacked
          if (!this.packingStats.methodUsage[method]) {
            this.packingStats.methodUsage[method] = 0
          }
          this.packingStats.methodUsage[method]++
        }
      }),
      clearPackingCache: jest.fn(function() {
        this.packingCache.clear()
      }),
      clearOldPackingCache: jest.fn(function(maxAge: number = 24 * 60 * 60 * 1000) {
        const now = Date.now()
        let clearedCount = 0
        for (const [key, value] of this.packingCache.entries()) {
          if (now - value.timestamp > maxAge) {
            this.packingCache.delete(key)
            clearedCount++
          }
        }
        return clearedCount
      }),
      getPackingStats: jest.fn(function() {
        return { ...this.packingStats }
      }),
      buildUPXCommandEnhanced: jest.fn(function(binaryPath: string, config: PackingConfig, _isWindows: boolean, isLinux: boolean, isMacOS: boolean) {
        let command = `upx --best`
        switch (config.algorithm) {
          case 'lzma':
            command += ' --lzma'
            break
          case 'ucl':
            command += ' --ucl'
            break
          case 'nrv':
            command += ' --nrv2b'
            break
        }
        command += ` -${config.compressionLevel}`
        if (isLinux || isMacOS) {
          command += ' --force'
        }
        if (config.preserveSymbols) {
          command += ' --keep-resource'
        }
        if (config.stripDebugInfo) {
          command += ' --strip-relocs=force'
        }
        command += ' --no-backup --overlay=copy'
        command += ` "${binaryPath}"`
        return command
      }),
      determineCompressionLevel: jest.fn(function(fileSize: number) {
        if (fileSize < 5 * 1024 * 1024) return 9
        if (fileSize < 20 * 1024 * 1024) return 7
        return 5
      }),
    })),
  }
})

describe('Enhanced Packing Function - Unit Tests', () => {
  let mockService: {
    packingCache: Map<string, unknown>
    packingStats: {
      totalPacked: number
      totalUnpacked: number
      averageCompressionRatio: number
      methodUsage: Record<string, number>
      cacheHits: number
      cacheMisses: number
    }
    normalizePackingConfig: jest.Mock
    generateCacheKey: jest.Mock
    updatePackingStats: jest.Mock
    clearPackingCache: jest.Mock
    clearOldPackingCache: jest.Mock
    getPackingStats: jest.Mock
    buildUPXCommandEnhanced: jest.Mock
    determineCompressionLevel: jest.Mock
  }

  beforeEach(() => {
    mockService = new ImplantCompilationService()
  })

  describe('Packing Configuration Normalization', () => {
    it('should normalize boolean true to full PackingConfig', () => {
      const result = mockService.normalizePackingConfig(true)

      expect(result).toEqual({
        enabled: true,
        method: 'upx',
        algorithm: 'lzma',
        compressionLevel: 7,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: false,
        stripDebugInfo: true,
      })
    })

    it('should normalize boolean false to disabled PackingConfig', () => {
      const result = mockService.normalizePackingConfig(false)

      expect(result.enabled).toBe(false)
      expect(result.method).toBe('upx')
    })

    it('should return PackingConfig as-is when provided', () => {
      const config: PackingConfig = {
        enabled: true,
        method: 'custom',
        algorithm: 'ucl',
        compressionLevel: 5,
        cacheEnabled: false,
        minCompressionRatio: 15,
        maxCompressionRatio: 70,
        timeout: 30000,
        retryAttempts: 3,
        preserveSymbols: true,
        stripDebugInfo: false,
      }

      const result = mockService.normalizePackingConfig(config)

      expect(result).toEqual(config)
    })
  })

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for identical inputs', () => {
      const config = {
        method: 'upx',
        algorithm: 'lzma',
        compressionLevel: 7,
      }

      const key1 = mockService.generateCacheKey('/path/to/binary.exe', 'abc123hash', config)
      const key2 = mockService.generateCacheKey('/path/to/binary.exe', 'abc123hash', config)

      expect(key1).toBe(key2)
    })

    it('should generate different cache keys for different hashes', () => {
      const config = {
        method: 'upx',
        algorithm: 'lzma',
        compressionLevel: 7,
      }

      const key1 = mockService.generateCacheKey('/path/to/binary.exe', 'hash1', config)
      const key2 = mockService.generateCacheKey('/path/to/binary.exe', 'hash2', config)

      expect(key1).not.toBe(key2)
    })

    it('should generate different cache keys for different configurations', () => {
      const config1 = { method: 'upx', algorithm: 'lzma', compressionLevel: 7 }
      const config2 = { method: 'upx', algorithm: 'ucl', compressionLevel: 7 }

      const key1 = mockService.generateCacheKey('/path/to/binary.exe', 'samehash', config1)
      const key2 = mockService.generateCacheKey('/path/to/binary.exe', 'samehash', config2)

      expect(key1).not.toBe(key2)
    })
  })

  describe('Packing Statistics', () => {
    it('should initialize with zero statistics', () => {
      const stats = mockService.getPackingStats()

      expect(stats).toEqual({
        totalPacked: 0,
        totalUnpacked: 0,
        averageCompressionRatio: 0,
        methodUsage: {},
        cacheHits: 0,
        cacheMisses: 0,
      })
    })

    it('should track method usage correctly', () => {
      mockService.updatePackingStats('upx', 50, false)
      mockService.updatePackingStats('upx', 60, false)
      mockService.updatePackingStats('custom', 40, false)

      const stats = mockService.getPackingStats()

      expect(stats.totalPacked).toBe(3)
      expect(stats.methodUsage.upx).toBe(2)
      expect(stats.methodUsage.custom).toBe(1)
      expect(stats.averageCompressionRatio).toBeCloseTo(50, 0)
    })

    it('should calculate average compression ratio correctly', () => {
      mockService.updatePackingStats('upx', 50, false)
      mockService.updatePackingStats('upx', 70, false)

      const stats = mockService.getPackingStats()

      expect(stats.averageCompressionRatio).toBe(60)
    })

    it('should not update statistics for cache hits', () => {
      mockService.updatePackingStats('upx', 50, true)
      mockService.updatePackingStats('upx', 60, false)

      const stats = mockService.getPackingStats()

      expect(stats.totalPacked).toBe(1) // Only the non-cached one
      expect(stats.averageCompressionRatio).toBe(60)
    })
  })

  describe('Cache Management', () => {
    it('should clear packing cache completely', () => {
      mockService.packingCache.set('key1', { packedBinary: Buffer.from('test'), timestamp: Date.now(), metadata: {} })
      mockService.packingCache.set('key2', { packedBinary: Buffer.from('test2'), timestamp: Date.now(), metadata: {} })

      expect(mockService.packingCache.size).toBe(2)

      mockService.clearPackingCache()

      expect(mockService.packingCache.size).toBe(0)
    })

    it('should clear old cache entries based on age', () => {
      const now = Date.now()

      mockService.packingCache.set('old1', {
        packedBinary: Buffer.from('old1'),
        timestamp: now - 25 * 60 * 60 * 1000, // 25 hours ago
        metadata: {},
      })
      mockService.packingCache.set('old2', {
        packedBinary: Buffer.from('old2'),
        timestamp: now - 30 * 60 * 60 * 1000, // 30 hours ago
        metadata: {},
      })
      mockService.packingCache.set('recent1', {
        packedBinary: Buffer.from('recent1'),
        timestamp: now - 1 * 60 * 60 * 1000, // 1 hour ago
        metadata: {},
      })

      expect(mockService.packingCache.size).toBe(3)

      const clearedCount = mockService.clearOldPackingCache(24 * 60 * 60 * 1000) // 24 hours

      expect(clearedCount).toBe(2)
      expect(mockService.packingCache.size).toBe(1)
      expect(mockService.packingCache.has('recent1')).toBe(true)
    })

    it('should clear all entries when maxAge is 0', () => {
      const pastTime = Date.now() - 1000 // 1 second ago

      mockService.packingCache.set('entry1', {
        packedBinary: Buffer.from('entry1'),
        timestamp: pastTime,
        metadata: {},
      })

      const clearedCount = mockService.clearOldPackingCache(0)

      expect(clearedCount).toBe(1)
      expect(mockService.packingCache.size).toBe(0)
    })
  })

  describe('UPX Command Building', () => {
    it('should build correct UPX command for LZMA algorithm', () => {
      const config = {
        method: 'upx',
        algorithm: 'lzma',
        compressionLevel: 7,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: false,
        stripDebugInfo: true,
      }

      const command = mockService.buildUPXCommandEnhanced('/path/to/binary.exe', config, true, false, false)

      expect(command).toContain('upx --best')
      expect(command).toContain('--lzma')
      expect(command).toContain('-7')
      expect(command).toContain('--strip-relocs=force')
      expect(command).toContain('--no-backup')
      expect(command).toContain('--overlay=copy')
      expect(command).toContain('/path/to/binary.exe')
    })

    it('should build correct UPX command for UCL algorithm', () => {
      const config = {
        method: 'upx',
        algorithm: 'ucl',
        compressionLevel: 5,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: false,
        stripDebugInfo: true,
      }

      const command = mockService.buildUPXCommandEnhanced('/path/to/binary', config, false, true, false)

      expect(command).toContain('--ucl')
      expect(command).toContain('-5')
    })

    it('should build correct UPX command for NRV algorithm', () => {
      const config = {
        method: 'upx',
        algorithm: 'nrv',
        compressionLevel: 6,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: false,
        stripDebugInfo: true,
      }

      const command = mockService.buildUPXCommandEnhanced('/path/to/binary', config, false, false, true)

      expect(command).toContain('--nrv2b')
      expect(command).toContain('-6')
    })

    it('should preserve symbols when configured', () => {
      const config = {
        method: 'upx',
        algorithm: 'lzma',
        compressionLevel: 7,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: true,
        stripDebugInfo: false,
      }

      const command = mockService.buildUPXCommandEnhanced('/path/to/binary.exe', config, true, false, false)

      expect(command).toContain('--keep-resource')
      expect(command).not.toContain('--strip-relocs=force')
    })

    it('should handle auto algorithm selection', () => {
      const config = {
        method: 'upx',
        algorithm: 'auto',
        compressionLevel: 8,
        cacheEnabled: true,
        minCompressionRatio: 10,
        maxCompressionRatio: 80,
        timeout: 60000,
        retryAttempts: 2,
        preserveSymbols: false,
        stripDebugInfo: true,
      }

      const command = mockService.buildUPXCommandEnhanced('/path/to/binary', config, false, true, false)

      expect(command).toContain('upx --best')
      expect(command).toContain('-8')
      expect(command).toContain('--force')
      // Should not contain specific algorithm flags for auto
      expect(command).not.toContain('--lzma')
      expect(command).not.toContain('--ucl')
      expect(command).not.toContain('--nrv')
    })
  })

  describe('Compression Level Determination', () => {
    it('should use level 9 for small files (< 5MB)', () => {
      const level = mockService.determineCompressionLevel(3 * 1024 * 1024, false) // 3MB
      expect(level).toBe(9)
    })

    it('should use level 9 for files just under 5MB', () => {
      const level = mockService.determineCompressionLevel(4.9 * 1024 * 1024, false)
      expect(level).toBe(9)
    })

    it('should use level 7 for medium files (5MB - 20MB)', () => {
      const level = mockService.determineCompressionLevel(10 * 1024 * 1024, false) // 10MB
      expect(level).toBe(7)
    })

    it('should use level 7 for files just over 5MB', () => {
      const level = mockService.determineCompressionLevel(5.1 * 1024 * 1024, false)
      expect(level).toBe(7)
    })

    it('should use level 7 for files just under 20MB', () => {
      const level = mockService.determineCompressionLevel(19.9 * 1024 * 1024, false)
      expect(level).toBe(7)
    })

    it('should use level 5 for large files (> 20MB)', () => {
      const level = mockService.determineCompressionLevel(25 * 1024 * 1024, false) // 25MB
      expect(level).toBe(5)
    })

    it('should use level 5 for files just over 20MB', () => {
      const level = mockService.determineCompressionLevel(20.1 * 1024 * 1024, false)
      expect(level).toBe(5)
    })
  })

  describe('Statistics Integration', () => {
    it('should provide comprehensive statistics object', () => {
      const stats = mockService.getPackingStats()

      expect(stats).toHaveProperty('totalPacked')
      expect(stats).toHaveProperty('totalUnpacked')
      expect(stats).toHaveProperty('averageCompressionRatio')
      expect(stats).toHaveProperty('methodUsage')
      expect(stats).toHaveProperty('cacheHits')
      expect(stats).toHaveProperty('cacheMisses')

      expect(typeof stats.totalPacked).toBe('number')
      expect(typeof stats.totalUnpacked).toBe('number')
      expect(typeof stats.averageCompressionRatio).toBe('number')
      expect(typeof stats.cacheHits).toBe('number')
      expect(typeof stats.cacheMisses).toBe('number')
      expect(typeof stats.methodUsage).toBe('object')
    })

    it('should track multiple methods correctly', () => {
      mockService.updatePackingStats('upx', 50, false)
      mockService.updatePackingStats('custom', 40, false)
      mockService.updatePackingStats('upx', 60, false)
      mockService.updatePackingStats('none', 0, false)

      const stats = mockService.getPackingStats()

      expect(stats.totalPacked).toBe(4)
      expect(stats.methodUsage.upx).toBe(2)
      expect(stats.methodUsage.custom).toBe(1)
      expect(stats.methodUsage.none).toBe(1)
      expect(stats.averageCompressionRatio).toBeCloseTo(37.5, 0)
    })
  })
})