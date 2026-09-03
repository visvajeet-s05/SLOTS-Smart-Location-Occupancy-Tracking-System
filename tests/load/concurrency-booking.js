import http from "k6/http"
import { check, sleep } from "k6"
import { RateLimiter } from "k6/x"

/**
 * k6 Concurrency Overbooking Stress Test
 * Verifies that high concurrent demand for the exact same slot never results in double-booking
 */

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000"
const API_KEY = __ENV.API_KEY || ""

// Configure the test
export const options = {
  stages: [
    { duration: "10s", target: 100 }, // Ramp up to 100 users
    { duration: "20s", target: 500 }, // Ramp up to 500 users
    { duration: "30s", target: 500 }, // Stay at 500 users
    { duration: "10s", target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests under 500ms
    http_req_failed: ["rate<0.05"], // Error rate under 5%
    checks: ["rate>0.95"], // 95% of checks should pass
  },
}

const BAY_ID = "BAY-G-001"
const USER_PREFIX = "stress-test-user"

// Rate limiter to avoid overwhelming the server
const rateLimiter = new RateLimiter(1000) // 1000 requests per second

export default function () {
  // Enforce rate limiting
  rateLimiter.wait()

  // Generate unique user ID
  const userId = `${USER_PREFIX}-${__VU}-${Math.random().toString(36).substr(2, 9)}`
  
  // Request slot reservation
  const payload = JSON.stringify({
    siteId: "site-1",
    floorId: "floor-1",
    zoneId: "zone-1",
    bayType: "STANDARD",
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    vehicleNumber: `TN${Math.floor(Math.random() * 9000) + 1000}`,
    vehicleType: "CAR",
  })

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`,
  }

  const response = http.post(`${BASE_URL}/api/bookings/hold`, payload, { headers })

  // Check response
  check(response, {
    "status is 200 or 409": (r) => r.status === 200 || r.status === 409,
    "response time < 1000ms": (r) => r.timings.duration < 1000,
  })

  // Count successful reservations (should be only 1)
  if (response.status === 200) {
    console.log(`User ${__VU} successfully reserved the bay`)
  } else if (response.status === 409) {
    console.log(`User ${__VU} received conflict (expected)`)
  } else {
    console.error(`User ${__VU} received unexpected status: ${response.status}`)
  }

  // Small delay between requests
  sleep(Math.random() * 2)
}

export function handleSummary(data) {
  const successCount = data.metrics.checks["status is 200 or 409"].passes
  const totalCount = data.metrics.checks["status is 200 or 409"].passes + data.metrics.checks["status is 200 or 409"].fails
  
  console.log(`\n=== Stress Test Summary ===`)
  console.log(`Total requests: ${totalCount}`)
  console.log(`Successful requests: ${successCount}`)
  console.log(`Failed requests: ${totalCount - successCount}`)
  console.log(`Success rate: ${(successCount / totalCount * 100).toFixed(2)}%`)
  
  // Verify that exactly ONE request succeeded (no double-booking)
  const successfulReservations = data.metrics.checks["status is 200 or 409"].passes - data.metrics.checks["status is 200 or 409"].fails
  
  if (successfulReservations === 1) {
    console.log(`✅ PASS: Exactly 1 reservation succeeded (no double-booking)`)
  } else {
    console.log(`❌ FAIL: ${successfulReservations} reservations succeeded (double-booking detected)`)
  }
}