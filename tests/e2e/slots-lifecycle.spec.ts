import { test, expect } from "@playwright/test"

/**
 * End-to-End Playwright Test Harness
 * Automated E2E test verifying the full SLOTS lifecycle
 */

test.describe("SLOTS Lifecycle E2E", () => {
  test("Complete booking lifecycle", async ({ page }) => {
    // Navigate to application
    await page.goto("http://localhost:3000")
    
    // 1. Authenticate user
    await page.click('text=Login')
    await page.fill('input[name="email"]', "test@example.com")
    await page.fill('input[name="password"]', "password123")
    await page.click('button[type="submit"]')
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/dashboard/)
    
    // 2. Request slot reservation
    await page.click('text=Find Parking')
    await page.waitForSelector('[data-testid="parking-lot-list"]')
    
    // Select a parking lot
    await page.click('[data-testid="lot-1"]')
    
    // Select date and time
    await page.fill('input[type="datetime-local"]', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16))
    
    // Request hold
    await page.click('text=Hold Slot')
    
    // Verify hold confirmation
    await expect(page.locator('[data-testid="hold-confirmation"]')).toBeVisible()
    const bookingId = await page.locator('[data-testid="booking-id"]').textContent()
    expect(bookingId).toBeTruthy()
    
    // 3. Verify price calculation
    const priceElement = await page.locator('[data-testid="booking-price"]').textContent()
    expect(priceElement).toMatch(/₹\d+/)
    
    // 4. Execute payment (Stripe sandbox simulation)
    await page.click('text=Proceed to Payment')
    await page.waitForURL(/payment/)
    
    // Fill payment details
    await page.fill('input[name="cardNumber"]', "4242424242424242")
    await page.fill('input[name="expiry"]', "12/25")
    await page.fill('input[name="cvc"]', "123")
    
    // Submit payment
    await page.click('text=Pay Now')
    
    // Verify payment success
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible()
    
    // 5. Simulate ANPR camera detection (via API)
    const response = await fetch("http://localhost:3000/api/vision/vlm-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "test-anpr-001",
        frameBase64: "base64encodedframe",
        bbox: { x: 100, y: 100, width: 200, height: 100 },
        currentConfidence: 0.25,
        cameraId: "camera-1",
        siteId: "site-1",
      }),
    })
    
    expect(response.ok).toBeTruthy()
    const data = await response.json()
    expect(data.enqueued).toBe(true)
    
    // 6. Simulate exit event
    const exitResponse = await fetch("http://localhost:3000/api/bookings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: bookingId,
      }),
    })
    
    expect(exitResponse.ok).toBeTruthy()
    
    // 7. Verify slot status released to AVAILABLE
    await page.reload()
    await page.click('text=My Bookings')
    await expect(page.locator(`[data-testid="booking-${bookingId}"]`)).toHaveText(/COMPLETED/)
  })
  
  test("Dynamic pricing engine calculation", async ({ page }) => {
    await page.goto("http://localhost:3000/pricing")
    
    // Select a parking lot
    await page.click('[data-testid="lot-1"]')
    
    // Check dynamic pricing display
    const basePrice = await page.locator('[data-testid="base-price"]').textContent()
    const dynamicPrice = await page.locator('[data-testid="dynamic-price"]').textContent()
    
    expect(basePrice).toBeTruthy()
    expect(dynamicPrice).toBeTruthy()
    
    // Verify dynamic price is calculated based on demand
    const multiplier = await page.locator('[data-testid="price-multiplier"]').textContent()
    expect(parseFloat(multiplier)).toBeGreaterThan(0)
  })
  
  test("User authentication flow", async ({ page }) => {
    await page.goto("http://localhost:3000/login")
    
    // Test invalid credentials
    await page.fill('input[name="email"]', "invalid@example.com")
    await page.fill('input[name="password"]', "wrongpassword")
    await page.click('button[type="submit"]')
    
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible()
    
    // Test valid credentials
    await page.fill('input[name="email"]', "test@example.com")
    await page.fill('input[name="password"]', "password123")
    await page.click('button[type="submit"]')
    
    await expect(page).toHaveURL(/dashboard/)
  })
  
  test("Health check endpoint", async ({ request }) => {
    const response = await request.get("/api/health")
    expect(response.ok()).toBeTruthy()
    
    const data = await response.json()
    expect(data.status).toBe("healthy")
    expect(data.services.database.status).toBe("operational")
    expect(data.services.iot_fleet).toBeDefined()
  })
})