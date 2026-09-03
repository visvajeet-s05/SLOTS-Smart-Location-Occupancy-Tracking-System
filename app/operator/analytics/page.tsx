import { RoiMetrics } from "@/components/operator/RoiMetrics"

/**
 * Operator Analytics Page
 * Provides operators with complete financial and operational insights
 */
export default function OperatorAnalyticsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Operator Analytics</h1>
        <p className="text-gray-600 mt-2">Financial and operational insights for your parking lot</p>
      </div>
      <RoiMetrics />
    </div>
  )
}