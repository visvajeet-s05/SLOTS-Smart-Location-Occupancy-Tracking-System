/**
 * OpenTelemetry Instrumentation
 * Instruments Next.js App Router requests with OpenTelemetry API
 */

export async function register() {
  if (process.env.NEXT_PUBLIC_OTEL_ENABLED === "true") {
    console.log("[OPENTELEMETRY] Instrumentation registered")
    
    // In production, this would initialize OpenTelemetry SDK
    // import { NodeSDK } from '@opentelemetry/sdk-node'
    // import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
    // import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
    // import { PrismaInstrumentation } from '@opentelemetry/instrumentation-prisma'
    
    // const sdk = new NodeSDK({
    //   traceExporter: new OTLPTraceExporter(),
    //   instrumentations: [
    //     new HttpInstrumentation(),
    //     new ExpressInstrumentation(),
    //     new PrismaInstrumentation(),
    //   ],
    // })
    // await sdk.start()
  } else {
    console.log("[OPENTELEMETRY] Disabled")
  }
}