# Database Setup for Integration Tests

## Overview

The test suite includes integration tests that require a PostgreSQL database connection. This guide explains how to set up a test database for running the full test suite.

## Current Status

✅ **Unit Tests**: Working (28 tests pass)
- Test helpers
- Configuration validation
- No database required

⚠️ **Integration Tests**: Require database setup
- ShadowGrok tests
- OPSEC workflow tests
- Require PostgreSQL database

## Quick Start (Unit Tests Only)

If you want to run tests without setting up a database, run only the unit tests:

```bash
npm test -- tests/unit/
```

## Setting Up a Test Database

### Option 1: Using Docker (Recommended)

The easiest way to set up a test database is using Docker:

```bash
# Start a PostgreSQL container
docker run --name hysteria-test-db \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  -d postgres:15

# Wait for the database to start (about 5 seconds)
sleep 5

# Run database migrations
npm run prisma:generate
npm run prisma:push

# Run all tests
npm test
```

### Option 2: Using Local PostgreSQL

If you have PostgreSQL installed locally:

```bash
# Create test database
createdb test_db

# Set environment variables
export DATABASE_URL="postgresql://test:test@localhost:5432/test_db"

# Run database migrations
npm run prisma:generate
npm run prisma:push

# Run all tests
npm test
```

### Option 3: Using Cloud Database

You can use a cloud PostgreSQL service like Supabase, Neon, or Railway:

1. Create a free PostgreSQL database
2. Get the connection string
3. Set the `DATABASE_URL` environment variable
4. Run migrations: `npm run prisma:push`
5. Run tests: `npm test`

## Environment Configuration

Create a `.env.test` file in your project root:

```env
# Test Database Configuration
DATABASE_URL="postgresql://test:test@localhost:5432/test_db"

# Test Environment
NODE_ENV=test

# Next.js Test Configuration
NEXTAUTH_SECRET="test-secret-key-for-testing-only"
NEXTAUTH_URL="http://localhost:3000"
```

## Running Migrations

Before running integration tests, ensure your database schema is up to date:

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema to database
npm run prisma:push

# Or use migrations (recommended for production-like setup)
npm run prisma:migrate
```

## Test Database Isolation

The test suite automatically:
- Cleans the database before each test run
- Seeds test data
- Cleans up after tests complete

This ensures tests don't interfere with each other and don't affect production data.

## Troubleshooting

### Connection Refused

**Error**: `User was denied access on the database`

**Solutions**:
1. Ensure PostgreSQL is running: `docker ps` or `pg_isready`
2. Check connection string in `.env.test`
3. Verify database credentials
4. Ensure database exists: `psql -U test -d test_db -c "\l"`

### Port Already in Use

**Error**: `port 5432 is already in use`

**Solutions**:
1. Stop existing PostgreSQL: `docker stop hysteria-test-db`
2. Use a different port: `-p 5433:5432`
3. Update DATABASE_URL to use new port

### Migration Failures

**Error**: `Migration failed`

**Solutions**:
1. Drop and recreate database: `dropdb test_db && createdb test_db`
2. Reset Prisma: `npx prisma migrate reset`
3. Check schema for conflicts

### Prisma Client Errors

**Error**: `PrismaClientInitializationError`

**Solutions**:
1. Regenerate client: `npm run prisma:generate`
2. Check DATABASE_URL is set correctly
3. Ensure node_modules are installed: `npm install`

## Test Commands

### Run Unit Tests (No Database Required)
```bash
npm test -- tests/unit/
```

### Run All Tests (Requires Database)
```bash
npm test
```

### Run Specific Test Suites
```bash
# ShadowGrok tests only
npm run test:shadowgrok

# OPSEC tests only
npm run test:opsec
```

### Run with Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## CI/CD Integration

For CI/CD pipelines, use a service database:

```yaml
# Example GitHub Actions
- name: Set up test database
  run: |
    docker run --name test-db -e POSTGRES_PASSWORD=test -p 5432:5432 -d postgres:15
    sleep 5

- name: Run migrations
  run: |
    npm run prisma:generate
    npm run prisma:push
  env:
    DATABASE_URL: postgresql://postgres:test@localhost:5432/postgres

- name: Run tests
  run: npm test
  env:
    DATABASE_URL: postgresql://postgres:test@localhost:5432/postgres
```

## Docker Compose Setup

Create a `docker-compose.test.yml` file:

```yaml
version: '3.8'
services:
  test-db:
    image: postgres:15
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test_db
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Run with:
```bash
docker-compose -f docker-compose.test.yml up -d
npm run prisma:push
npm test
```

## Cleanup

### Stop Test Database (Docker)
```bash
docker stop hysteria-test-db
docker rm hysteria-test-db
```

### Drop Local Database
```bash
dropdb test_db
```

### Clean Test Artifacts
```bash
rm -rf coverage/
rm -rf .next/
```

## Best Practices

1. **Always use a separate test database** - Never test on production
2. **Clean database between tests** - Tests should be isolated
3. **Use environment variables** - Keep credentials out of code
4. **Run migrations before tests** - Ensure schema is current
5. **Mock external services** - Don't depend on external APIs in tests
6. **Use transactions** - Roll back changes after each test

## Alternative: In-Memory Testing

If you prefer not to set up a database, you can:

1. Use SQLite for faster tests
2. Mock the Prisma client completely
3. Run only unit tests

To use SQLite, update your `DATABASE_URL`:
```env
DATABASE_URL="file:./test.db"
```

## Support

For database-related issues:
1. Check PostgreSQL logs: `docker logs hysteria-test-db`
2. Test connection: `psql $DATABASE_URL -c "SELECT 1"`
3. Review Prisma docs: https://www.prisma.io/docs
4. Check test logs for specific errors