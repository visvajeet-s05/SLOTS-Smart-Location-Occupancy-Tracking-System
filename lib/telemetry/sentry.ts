/**
 * OpenTelemetry & Sentry Tracing Integration
 * Distributed request tracing for high-concurrency reservation flows
 */

// Sentry integration - optional (requires @sentry/nextjs package)
let Sentry: any = null

try {
  Sentry = require("@sentry/nextjs")
} catch (error) {
  console.log("[SENTRY] @sentry/nextjs not installed, skipping Sentry integration")
}

/**
 * Initialize Sentry
 */
export function initSentry() {
  if (!Sentry) {
    console.log("[SENTRY] Skipping initialization (package not installed)")
    return
  }

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 1.0, // Capture 100% of transactions in production
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay(),
      ],
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    })
    console.log("[SENTRY] Initialized")
  } else {
    console.log("[SENTRY] DSN not provided, skipping initialization")
  }
}

/**
 * Capture exception
 */
export function captureException(error: Error, context?: any) {
  if (Sentry) {
    Sentry.captureException(error, context)
  } else {
    console.error("[SENTRY] Exception:", error)
  }
}

/**
 * Capture message
 */
export function captureMessage(message: string, level: any = "info") {
  if (Sentry) {
    Sentry.captureMessage(message, { level })
  } else {
    console.log(`[SENTRY] ${level}: ${message}`)
  }
}

/**
 * Start transaction
 */
export function startTransaction(name: string, op: string): any {
  if (Sentry) {
    return Sentry.startTransaction({ name, op })
  }
  return null
}

/**
 * Set user context
 */
export function setUserContext(user: { id: string; email?: string; username?: string }) {
  if (Sentry) {
    Sentry.setUser(user)
  }
}

/**
 * Clear user context
 */
export function clearUserContext() {
  if (Sentry) {
    Sentry.setUser(null)
  }
}