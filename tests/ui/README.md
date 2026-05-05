# UI Testing Guide

This project uses two UI testing frameworks:

## Component Testing (Jest + React Testing Library)

Component tests are used to test individual React components in isolation.

### Running Component Tests

```bash
# Run all UI component tests
npm run test:ui

# Run UI tests in watch mode
npm run test:ui:watch

# Run all tests (including backend)
npm test
```

### Writing Component Tests

Component tests are located in `tests/ui/`. Example test structure:

```tsx
import { describe, it, expect } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button Component', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeInTheDocument()
  })
})
```

### Best Practices

- Use `data-slot` attributes for querying components when possible
- Test user behavior, not implementation details
- Use semantic queries (getByRole, getByLabelText) over text queries
- Keep tests isolated and focused

## E2E Testing (Playwright)

E2E tests are used to test the application as a whole, simulating real user interactions.

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI mode
npm run test:e2e:ui

# Run E2E tests in debug mode
npm run test:e2e:debug

# Run E2E tests in headed mode (visible browser)
npm run test:e2e:headed
```

### Writing E2E Tests

E2E tests are located in `tests/e2e/`. Example test structure:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('form')).toBeVisible()
  })
})
```

### Test Configuration

- **Browsers**: Chromium, Firefox, WebKit
- **Base URL**: http://localhost:3000
- **Auto-start**: Dev server starts automatically before tests
- **Timeout**: 120 seconds for server startup

### Best Practices

- Use page objects for complex interactions
- Wait for elements to be visible before interacting
- Use data-testid attributes for stable selectors
- Keep tests independent and order-independent
- Use beforeEach/afterEach for test setup/teardown

## Test Utilities

Custom test utilities are available in `tests/ui/test-utils.tsx`:

```tsx
import { renderWithProviders } from '@/tests/ui/test-utils'

// Renders components with necessary providers
renderWithProviders(<MyComponent />, { locale: 'en' })
```

## Coverage

To generate coverage reports:

```bash
npm run test:coverage
```

This will generate a coverage report in the `coverage/` directory.