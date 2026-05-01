# Test Suite Documentation

Complete automated test suite for red-team operations framework validation.

## Overview

This test suite validates every critical stage of real red-team operations before running them live, ensuring infrastructure spin-up, implant deployment, traffic blending, kill switches, OSINT, risk assessment, approvals, and full autonomous operations work correctly.

## Current Status

✅ **Unit Tests**: Working (28 tests pass)
- Test helpers and utilities
- Configuration validation
- No database required

⚠️ **Integration Tests**: Require database setup
- ShadowGrok tests (database required)
- OPSEC workflow tests (database required)

See <ref_file file="/Users/adminuser/vsc/blackboxai-hysteria2-sonner-1/tests/DATABASE_SETUP.md" /> for database setup instructions.

## Quick Start

### Run Unit Tests (No Database Required)
```bash
npm test -- tests/unit/
```

### Run All Tests (Requires Database Setup)
1. Set up test database (see DATABASE_SETUP.md)
2. Run migrations: `npm run prisma:push`
3. Run tests: `npm test`

### Docker Quick Start
```bash
# Start test database
docker run --name hysteria-test-db \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  -d postgres:15

# Wait for database to start
sleep 5

# Run migrations
npm run prisma:push

# Run tests
npm test
```

## Test Structure

```
tests/
├── unit/                       # Unit tests (no database required)
│   ├── test-helpers.test.ts
│   └── traffic-blending-config.test.ts
├── opsec/                      # End-to-end red team workflows (database required)
│   ├── infrastructure-test.test.ts
│   ├── implant-deployment.test.ts
│   ├── traffic-blending.test.ts
│   └── end-to-end-workflow.test.ts
├── shadowgrok/                 # ShadowGrok core (database required)
│   ├── shadowgrok-execution.test.ts
│   ├── shadowgrok-approval.test.ts
│   └── agent-task.test.ts
├── setup/                      # Global test environment
│   ├── jest.setup.js
│   ├── database.ts             # Real database setup
│   └── database-mock.ts        # Mock database setup
├── utils/                      # Helpers & mock servers
│   ├── test-helpers.ts
│   └── mock-server.ts
├── fixtures/                   # Test targets & sample data
│   └── test-data.ts
├── README.md                   # This file
└── DATABASE_SETUP.md           # Database setup guide
```

## Test Categories

### 1. Unit Tests (`tests/unit/`)

Tests that don't require a database connection and can run in isolation.

#### Test Helpers Tests (`test-helpers.test.ts`)
- Test ID generation
- Wait and retry utilities
- API response mocking
- Email validation
- Email and domain generation

#### Configuration Tests (`traffic-blending-config.test.ts`)
- CDN proxy configuration validation
- Domain fronting setup validation
- DNS tunneling configuration validation
- Kill switch configuration validation
- OPSEC validation
- Configuration conflict detection

### 2. OPSEC Tests (`tests/opsec/`)

End-to-end red team workflows that validate complete operational scenarios.

#### Infrastructure Tests (`infrastructure-test.test.ts`)
- Node creation and management
- Status transitions (stopped → running)
- Heartbeat monitoring
- Profile management
- Health checks and availability tracking
- Multi-node deployments

#### Implant Deployment Tests (`implant-deployment.test.ts`)
- Implant creation and uniqueness
- Configuration management
- Callback tracking (first seen, last seen)
- Status transitions (dormant → active → killed)
- Task execution and result handling
- Payload build management
- Stale implant detection

#### Traffic Blending Tests (`traffic-blending.test.ts`)
- CDN proxy configuration
- Domain fronting setup
- DNS tunneling configuration
- Traffic obfuscation methods
- Kill switch implementation
- OPSEC validation
- Traffic analysis resistance

#### End-to-End Workflow Tests (`end-to-end-workflow.test.ts`)
- Complete operation lifecycle
- AI-assisted operations with ShadowGrok
- OSINT integration
- Risk assessment
- Kill switch activation
- Report generation
- Audit trail maintenance
- Error handling and recovery

### 2. ShadowGrok Tests (`tests/shadowgrok/`)

Core AI agent functionality, tool approvals, and safety mechanisms.

#### Execution Tests (`shadowgrok-execution.test.ts`)
- Execution creation and management
- Tool call tracking
- Success/failure statistics
- Execution timing
- Approval-required workflows
- Query operations by status/user

#### Approval Tests (`shadowgrok-approval.test.ts`)
- Approval request creation
- Granting and rejecting approvals
- Expiration handling
- Risk assessment integration
- High-risk operation detection
- Safety checks and validation

#### Agent Task Tests (`agent-task.test.ts`)
- Task creation with tool permissions
- Step execution and sequencing
- Status transitions (queued → running → completed/failed)
- Step counting and limits
- Different step kinds (thought, tool_call, observation, error)
- Query operations

### 3. Test Setup (`tests/setup/`)

Global test environment configuration and database management.

#### Jest Setup (`jest.setup.js`)
- Environment variable mocking
- Next.js router mocking
- Browser API mocking (matchMedia, IntersectionObserver, ResizeObserver)
- Console error handling
- Global test timeout configuration

#### Database Setup (`database.ts`)
- Database cleanup between tests
- Test data seeding
- Prisma client management
- Setup and teardown utilities

### 4. Test Utilities (`tests/utils/`)

Reusable helpers and mock servers for testing.

#### Test Helpers (`test-helpers.ts`)
- Test ID generation
- Wait and retry utilities
- API response mocking
- Prisma client mocking
- Date and environment mocking
- File system mocking
- Email and domain generation

#### Mock Servers (`mock-server.ts`)
- HTTP mock server
- SMTP mock server for email testing
- WebSocket mock server
- External API mocks (VirusTotal, AlienVault, AbuseIPDB)
- Hysteria2 server mock
- Redis mock for BullMQ

### 5. Test Fixtures (`tests/fixtures/`)

Realistic test scenarios and sample data.

#### Test Data (`test-data.ts`)
- Operator, operation, and node fixtures
- Implant and payload configurations
- ShadowGrok execution and tool call data
- OSINT and threat intelligence samples
- Email campaign data
- Network map configurations
- Workflow session data
- Kill switch scenarios
- Traffic blending configurations
- Risk assessment data

## Running Tests

### Run Unit Tests (No Database Required)
```bash
npm test -- tests/unit/
```

### Run All Tests (Requires Database)
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run ShadowGrok Tests Only (Requires Database)
```bash
npm run test:shadowgrok
```

### Run OPSEC Tests Only (Requires Database)
```bash
npm run test:opsec
```

### Run Tests with Verbose Output
```bash
npm run test:verbose
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- Test environment: jsdom
- Module name mapping for path aliases
- Coverage thresholds: 60% for branches, functions, lines, statements
- Test timeout: 30 seconds
- Max workers: 50% (for parallel execution)

### Environment Variables
Tests use the following environment variables (configured in `jest.setup.js`):
- `NODE_ENV=test`
- `DATABASE_URL` (test database)
- `NEXTAUTH_SECRET` (test secret)
- `NEXTAUTH_URL` (test URL)

## Test Database

The test suite uses a separate test database to avoid affecting production data. The database is:
- Cleaned before each test run
- Seeded with test data
- Torn down after tests complete

### Database Setup
```typescript
import { setupTestDatabase, teardownTestDatabase } from './tests/setup/database'

beforeAll(async () => {
  await setupTestDatabase()
})

afterAll(async () => {
  await teardownTestDatabase()
})
```

## Writing New Tests

### Test Template
```typescript
import { PrismaClient } from '@prisma/client'
import { setupTestDatabase, teardownTestDatabase, prisma } from '../setup/database'

describe('Test Suite Name', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    // Clean up specific tables
    await prisma.yourModel.deleteMany()
  })

  it('should do something', async () => {
    // Test implementation
    expect(result).toBe(expected)
  })
})
```

### Using Test Fixtures
```typescript
import { testOperator, testOperation } from '../fixtures/test-data'

const operation = await prisma.operation.create({
  data: testOperation,
})
```

### Using Test Helpers
```typescript
import { generateTestId, wait, retry } from '../utils/test-helpers'

const testId = generateTestId('operation')
await wait(1000)
const result = await retry(async () => {
  return await someOperation()
})
```

### Using Mock Servers
```typescript
import { MockServer, MockSMTPServer } from '../utils/mock-server'

const server = new MockServer({
  port: 3001,
  routes: {
    '/api/test': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    },
  },
})

await server.start()
// Run tests
await server.stop()
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up database records in `beforeEach` or `afterEach`
3. **Fixtures**: Use test fixtures for consistent test data
4. **Mocking**: Mock external services and APIs to avoid dependencies
5. **Timeouts**: Set appropriate timeouts for async operations
6. **Error Handling**: Test both success and failure scenarios
7. **Coverage**: Aim for high coverage of critical paths
8. **Documentation**: Document complex test scenarios with comments

## Coverage Targets

- **Branches**: 60%
- **Functions**: 60%
- **Lines**: 60%
- **Statements**: 60%

Coverage reports are generated in the `coverage/` directory when running `npm run test:coverage`.

## Troubleshooting

### Tests Fail Due to Database Connection
Ensure your test database is configured in `.env`:
```
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
```

### Tests Timeout
Increase timeout in `jest.config.js`:
```javascript
testTimeout: 60000, // 60 seconds
```

### Module Not Found Errors
Check path aliases in `jest.config.js` and ensure they match `tsconfig.json`.

### Mock Server Issues
Ensure ports are available and not in use by other processes.

## Continuous Integration

These tests are designed to run in CI/CD pipelines. Example GitHub Actions workflow:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run prisma:generate
      - run: npm test
      - run: npm run test:coverage
```

## Contributing

When adding new features:
1. Write tests for the new functionality
2. Ensure all existing tests pass
3. Update this documentation if adding new test categories
4. Maintain or improve coverage percentages

## Support

For issues or questions about the test suite:
1. Check this documentation
2. Review test files for examples
3. Check Jest documentation: https://jestjs.io/
4. Review Prisma testing docs: https://www.prisma.io/docs/guides/testing/integration-testing