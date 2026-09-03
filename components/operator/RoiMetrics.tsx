"use client"

import { Card } from "@/components/ui/card"
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"]

interface KpiCardProps {
  title: string
  value: string | number
  change?: string
  trend?: "up" | "down"
}

function KpiCard({ title, value, change, trend }: KpiCardProps) {
  return (
    <Card className="p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="text-2xl font-bold">{value}</div>
      {change && (
        <div className={`text-sm mt-2 ${trend === "up" ? "text-green-600" : "text-red-600"}`}>
          {change}
        </div>
      )}
    </Card>
  )
}

/**
 * Lot Operator ROI & Analytics Dashboard
 * Provides operators with complete financial and operational insights
 */
export function RoiMetrics() {
  // Mock data - in production, this would be fetched from API
  const hourlyOccupancyData = [
    { hour: "00:00", occupancy: 25 },
    { hour: "04:00", occupancy: 15 },
    { hour: "08:00", occupancy: 65 },
    { hour: "12:00", occupancy: 85 },
    { hour: "16:00", occupancy: 90 },
    { hour: "20:00", occupancy: 75 },
  ]

  const priceMultiplierData = [
    { day: "Mon", multiplier: 1.0 },
    { day: "Tue", multiplier: 1.1 },
    { day: "Wed", multiplier: 1.2 },
    { day: "Thu", multiplier: 1.15 },
    { day: "Fri", multiplier: 1.4 },
    { day: "Sat", multiplier: 1.3 },
    { day: "Sun", multiplier: 1.1 },
  ]

  const revenueBreakdownData = [
    { name: "FASTag", value: 45000 },
    { name: "Stripe", value: 35000 },
    { name: "Web3", value: 15000 },
  ]

  const subscriptionData = [
    { month: "Jan", rate: 85 },
    { month: "Feb", rate: 87 },
    { month: "Mar", rate: 89 },
    { month: "Apr", rate: 92 },
    { month: "May", rate: 90 },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Revenue"
          value="₹95,000"
          change="+12.5%"
          trend="up"
        />
        <KpiCard
          title="Avg Turnaround Time"
          value="2.5 hrs"
          change="-8.3%"
          trend="up"
        />
        <KpiCard
          title="Peak Utilization Hour"
          value="16:00"
          change="Same"
        />
        <KpiCard
          title="EV kWh Consumption"
          value="1,250 kWh"
          change="+25.0%"
          trend="up"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Occupancy Rate */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Hourly Occupancy Rate</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyOccupancyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="occupancy" fill="#3b82f6" name="Occupancy %" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Dynamic Price Yield Multiplier */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Dynamic Price Yield Multiplier</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={priceMultiplierData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="multiplier" stroke="#10b981" strokeWidth={2} name="Multiplier" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Revenue Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueBreakdownData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {revenueBreakdownData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Subscription Renewal Rate */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Pass Subscription Renewal Rate</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={subscriptionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="rate" stroke="#f59e0b" strokeWidth={2} name="Renewal %" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}