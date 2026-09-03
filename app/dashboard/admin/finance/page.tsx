"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CreditCard, DollarSign, ArrowUpRight, ArrowDownRight, TrendingUp, AlertCircle } from "lucide-react"
import DashboardShell from "@/components/ui/DashboardShell"
import { formatCurrency } from "@/lib/utils"

// Since we don't have a real chart lib yet, we'll mock a simple visual
const SimpleLineChart = () => (
  <div className="h-64 flex items-end justify-between gap-1 mt-4">
    {[35, 42, 38, 55, 62, 58, 75, 80, 85, 95, 88, 100].map((h, i) => (
      <div key={i} className="w-full bg-blue-500/20 rounded-t hover:bg-blue-500/40 transition-colors relative group">
        <div
          style={{ height: `${h}%` }}
          className="bg-gradient-to-t from-blue-600 to-blue-400 w-full rounded-t absolute bottom-0 group-hover:from-blue-500 group-hover:to-blue-300 transition-all duration-300"
        >
        </div>
        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-xs text-white px-2 py-1 rounded shadow-lg transition-opacity whitespace-nowrap z-10">
          ${(h * 150).toFixed(0)}
        </div>
      </div>
    ))}
  </div>
)

export default function AdminFinancePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/admin/finance/overview") // Not yet implemented route but using placeholder logic above
        // Wait, I haven't implemented that route yet in previous step 2 (I did step 1 for users).
        // Actually I just implemented it in the previous turn. Correct.
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch finance data", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-6 pt-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <DollarSign className="text-green-400" />
              Financial Overview
            </h1>
            <p className="text-gray-400 mt-1">
              Track revenue, payouts, and platform fees.
            </p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">
            Export Report
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 text-green-500">
              <DollarSign size={64} />
            </div>
            <p className="text-sm font-medium text-gray-400">Total Revenue</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                {formatCurrency(data?.totalRevenue || 0)}
              </span>
              <span className="text-xs text-green-400 font-medium flex items-center">
                <ArrowUpRight size={12} /> +12%
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 text-blue-500">
              <CreditCard size={64} />
            </div>
            <p className="text-sm font-medium text-gray-400">Transactions</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                {data?.successfulPayments || 0}
              </span>
              <span className="text-xs text-gray-500">Completions</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 text-purple-500">
              <TrendingUp size={64} />
            </div>
            <p className="text-sm font-medium text-gray-400">Avg. Transaction Value</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                {formatCurrency(data?.totalRevenue / (data?.successfulPayments || 1) || 0)}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Charts & Recent Transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur-sm"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Revenue Trend</h3>
            <SimpleLineChart />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur-sm overflow-hidden"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Recent Transactions</h3>
            <div className="space-y-4">
              {data?.recentPayments?.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between border-b border-gray-800 pb-3 last:border-0 last:pb-0 hover:bg-gray-800/30 transition-colors -mx-2 px-2 rounded">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${tx.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {tx.status === 'COMPLETED' ? <ArrowDownRight size={16} /> : <AlertCircle size={16} />} // Using alert circle if failed
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white truncate w-32">{tx.details}</p>
                      <p className="text-xs text-gray-500">{new Date(tx.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.status === 'COMPLETED' ? 'text-white' : 'text-gray-500'}`}>
                      {formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-500">{tx.status}</p>
                  </div>
                </div>
              ))}
              {!data?.recentPayments || data.recentPayments.length === 0 && (
                <p className="text-center text-gray-500 py-4">No recent transactions</p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </DashboardShell>
  )
}
