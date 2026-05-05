// Jest setup file
import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'util'
import { TransformStream, ReadableStream, WritableStream } from 'node:stream/web'

// jsdom omits TextDecoder on global in some Jest setups; undici/encoding expects it
globalThis.TextDecoder = TextDecoder
globalThis.TextEncoder = TextEncoder

// Web Streams API (required by AI SDK / eventsource-parser under jsdom)
if (typeof globalThis.TransformStream === 'undefined') {
  globalThis.TransformStream = TransformStream
}
if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = ReadableStream
}
if (typeof globalThis.WritableStream === 'undefined') {
  globalThis.WritableStream = WritableStream
}

// Mock environment variables
process.env.NODE_ENV = 'test'
// Use existing database for testing
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://adminuser@localhost:5432/hysteria2?schema=public'
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only'
process.env.NEXTAUTH_URL = 'http://localhost:3000'

// Polyfill setImmediate for Jest
if (typeof setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => setTimeout(() => fn(...args), 0)
}
if (typeof clearImmediate === 'undefined') {
  global.clearImmediate = (id) => clearTimeout(id)
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Browser-only mocks — only set up when running in jsdom (not in node env)
if (typeof window !== 'undefined') {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    takeRecords() {
      return []
    }
    unobserve() {}
  }

  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    unobserve() {}
  }
}

// Suppress console errors in tests (optional, can be removed for debugging)
const originalError = console.error
const originalWarn = console.warn
const originalLog = console.log

// Patterns to suppress in tests (expected warnings/errors)
const suppressPatterns = [
  'Warning: ReactDOM.render',
  'localstorage-file',
  'Not implemented: HTMLFormElement.prototype.submit',
  'Not implemented: window.scrollTo',
  'Not implemented: HTMLDialogElement.prototype.showModal',
]

beforeAll(() => {
  console.error = (...args) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])
    const shouldSuppress = suppressPatterns.some(pattern => message.includes(pattern))

    if (!shouldSuppress) {
      originalError.call(console, ...args)
    }
  }

  console.warn = (...args) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])
    const shouldSuppress = suppressPatterns.some(pattern => message.includes(pattern))

    if (!shouldSuppress) {
      originalWarn.call(console, ...args)
    }
  }

  // Reduce log noise in tests while keeping important info
  console.log = (...args) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])

    // Keep important log messages, filter noise
    const shouldKeep = [
      '✅',
      '❌',
      'Test',
      'PASS',
      'FAIL',
      'Error:',
      'Warning:',
      '[ShadowGrok]',
      '[AI]',
    ].some(pattern => message.includes(pattern))

    if (shouldKeep) {
      originalLog.call(console, ...args)
    }
  }
})

afterAll(() => {
  console.error = originalError
  console.warn = originalWarn
  console.log = originalLog
})

// Global test timeout
jest.setTimeout(30000)