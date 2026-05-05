import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.fill('input[name="email"]', 'admin@example.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/admin')
  })

  test('should display dashboard overview', async ({ page }) => {
    // Check if dashboard widgets are visible
    await expect(page.locator('[data-slot="dashboard-widgets"]')).toBeVisible()
    await expect(page.getByText('Overview')).toBeVisible()
  })

  test('should navigate to beacons page', async ({ page }) => {
    // Click on beacons in sidebar
    await page.click('text=Beacons')
    
    // Wait for navigation
    await page.waitForURL('/admin/beacons')
    
    // Verify beacons page is loaded
    await expect(page).toHaveURL('/admin/beacons')
    await expect(page.getByText('Beacons')).toBeVisible()
  })

  test('should navigate to nodes page', async ({ page }) => {
    // Click on nodes in sidebar
    await page.click('text=Nodes')
    
    // Wait for navigation
    await page.waitForURL('/admin/nodes')
    
    // Verify nodes page is loaded
    await expect(page).toHaveURL('/admin/nodes')
    await expect(page.getByText('Nodes')).toBeVisible()
  })

  test('should navigate to payloads page', async ({ page }) => {
    // Click on payloads in sidebar
    await page.click('text=Payloads')
    
    // Wait for navigation
    await page.waitForURL('/admin/payloads')
    
    // Verify payloads page is loaded
    await expect(page).toHaveURL('/admin/payloads')
    await expect(page.getByText('Payloads')).toBeVisible()
  })

  test('should display sidebar navigation', async ({ page }) => {
    // Check if sidebar is visible
    await expect(page.locator('[data-slot="sidebar"]')).toBeVisible()
    
    // Check for common navigation items
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('Beacons')).toBeVisible()
    await expect(page.getByText('Nodes')).toBeVisible()
    await expect(page.getByText('Payloads')).toBeVisible()
  })

  test('should display admin header', async ({ page }) => {
    // Check if admin header is visible
    await expect(page.locator('[data-slot="admin-header"]')).toBeVisible()
  })
})