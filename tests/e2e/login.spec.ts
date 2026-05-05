import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login')
    
    // Check if login form is visible
    await expect(page.locator('form')).toBeVisible()
    await expect(page.getByText('Sign in')).toBeVisible()
  })

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.goto('/login')
    
    // Try to submit without filling fields
    await page.click('button[type="submit"]')
    
    // Check for validation errors
    await expect(page.locator('text=Email is required')).toBeVisible()
  })

  test('should navigate to admin dashboard on successful login', async ({ page }) => {
    await page.goto('/login')
    
    // Fill in login credentials
    await page.fill('input[name="email"]', 'admin@example.com')
    await page.fill('input[name="password"]', 'password123')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Wait for navigation to dashboard
    await page.waitForURL('/admin')
    
    // Verify we're on the dashboard
    await expect(page).toHaveURL('/admin')
    await expect(page.getByText('Dashboard')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    
    // Fill in invalid credentials
    await page.fill('input[name="email"]', 'invalid@example.com')
    await page.fill('input[name="password"]', 'wrongpassword')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Check for error message
    await expect(page.locator('text=Invalid credentials')).toBeVisible()
  })
})