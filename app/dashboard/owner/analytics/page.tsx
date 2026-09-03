"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Download,
  Calendar as CalendarIcon,
  TrendingUp,
  Users,
  Car,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Layers,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import PeakHoursChart from "@/components/analytics/PeakHoursChart";
import OccupancyTrends from "@/components/analytics/OccupancyTrends";
import RevenueChart from "@/components/analytics/RevenueChart";
import AIAccuracyChart from "@/components/analytics/AIAccuracyChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AnalyticsData {
  overview: {
    totalSlots: number;
    occupiedSlots: number;
    availableSlots: number;
    reservedSlots: number;
    occupancyRate: number;
    avgConfidence: number;
  };
  peakHours: {
    hourlyData: Array<{ hour: number; count: number; label: string }>;
    peakHour: number;
    peakHourLabel: string;
    peakOccupancy: number;
  };
  occupancyTrends: Array<{
    date: string;
    occupied: number;
    available: number;
    total: number;
  }>;
  revenue: {
    totalRevenue: number;
    totalBookings: number;
    avgRevenuePerDay: number;
    avgBookingsPerDay: number;
    pricePerHour: number;
    estimatedMonthlyRevenue: number;
  };
  aiAccuracy: {
    totalPredictions: number;
    correctPredictions: number;
    accuracy: number;
    confidence: number;
  };
  customerMetrics: {
    totalCustomers: number;
    repeatCustomers: number;
    repeatRate: number;
    avgBookingDuration: number;
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function OwnerAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(7);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPeriod]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/owner/analytics?days=${selectedPeriod}`);
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportData = () => {
    if (!analytics) return;

    const csvContent = [
      ["Metric", "Value"],
      ["Total Slots", analytics.overview.totalSlots],
      ["Occupancy Rate", `${analytics.overview.occupancyRate}%`],
      ["Total Revenue", `₹${analytics.revenue.totalRevenue}`],
      ["Total Bookings", analytics.revenue.totalBookings],
      ["AI Accuracy", `${analytics.aiAccuracy.accuracy}%`],
      ["Total Customers", analytics.customerMetrics.totalCustomers],
      ["Peak Hour", analytics.peakHours.peakHourLabel],
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-cyan-500/30">
      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
         className="relative w-full max-w-[1440px] mx-auto px-6 lg:px-8 pt-0 pb-20 space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-cyan-400 font-medium">
              <Sparkles size={18} />
              <span className="text-sm tracking-wider uppercase">Business Intelligence</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Analytics Center</h1>
            <p className="text-gray-400">Deep insights into your facility's operational efficiency</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
              {[7, 14, 30].map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedPeriod === period
                    ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20"
                    : "text-gray-400 hover:text-white"
                    }`}
                >
                  {period}D
                </button>
              ))}
            </div>
            <Button
              onClick={exportData}
              variant="outline"
              className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-10"
            >
              <Download size={16} className="mr-2" />
              Export Data
            </Button>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            <p className="text-gray-500 font-medium animate-pulse">Synthesizing intelligence...</p>
          </div>
        ) : !analytics ? (
          <div className="py-20 text-center border border-white/10 rounded-3xl bg-white/5">
            <p className="text-red-400">Failed to establish connection with Analytics Engine</p>
            <Button variant="link" onClick={fetchAnalytics}>Retry Connection</Button>
          </div>
        ) : (
          <>
            {/* Overview Cards */}
            <motion.div variants={itemVariants} className="grid w-full grid-cols-1 md:grid-cols-4 gap-6">
              <AnalyticsCard
                icon={<Car className="text-cyan-400" />}
                label="Average Occupancy"
                value={`${analytics.overview.occupancyRate}%`}
                trend="+2.4%"
                trendUp={true}
                subtext={`${analytics.overview.occupiedSlots}/${analytics.overview.totalSlots} Slots Used`}
                color="cyan"
              />
              <AnalyticsCard
                icon={<CalendarIcon className="text-green-400" />}
                label="Total Revenue"
                value={`₹${analytics.revenue.totalRevenue.toLocaleString()}`}
                trend="+12%"
                trendUp={true}
                subtext={`${analytics.revenue.totalBookings} Total Bookings`}
                color="green"
              />
              <AnalyticsCard
                icon={<Brain className="text-purple-400" />}
                label="AI Perception"
                value={`${analytics.aiAccuracy.accuracy.toFixed(1)}%`}
                trend="Stable"
                trendUp={true}
                subtext={`${analytics.aiAccuracy.confidence.toFixed(1)}% Confidence`}
                color="purple"
              />
              <AnalyticsCard
                icon={<Users className="text-yellow-400" />}
                label="Growth Index"
                value={analytics.customerMetrics.totalCustomers.toString()}
                trend={`${analytics.customerMetrics.repeatRate}% Repeat`}
                trendUp={true}
                subtext="Total Unique Visitors"
                color="yellow"
              />
            </motion.div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div variants={itemVariants} className="w-full bg-white/5 border border-white/10 rounded-3xl p-4 backdrop-blur-xl">
                <PeakHoursChart
                  data={analytics.peakHours.hourlyData}
                  peakHour={analytics.peakHours.peakHour}
                />
              </motion.div>
              <motion.div variants={itemVariants} className="w-full bg-white/5 border border-white/10 rounded-3xl p-4 backdrop-blur-xl">
                <OccupancyTrends data={analytics.occupancyTrends} />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div variants={itemVariants} className="w-full bg-white/5 border border-white/10 rounded-3xl p-4 backdrop-blur-xl">
                <RevenueChart
                  totalRevenue={analytics.revenue.totalRevenue}
                  commission={analytics.revenue.totalRevenue * 0.12}
                  tax={analytics.revenue.totalRevenue * 0.18}
                  netPayout={analytics.revenue.totalRevenue * 0.7}
                />
              </motion.div>
              <motion.div variants={itemVariants} className="w-full bg-white/5 border border-white/10 rounded-3xl p-4 backdrop-blur-xl">
                <AIAccuracyChart
                  accuracy={analytics.aiAccuracy.accuracy}
                  confidence={analytics.aiAccuracy.confidence}
                  totalPredictions={analytics.aiAccuracy.totalPredictions}
                  correctPredictions={analytics.aiAccuracy.correctPredictions}
                />
              </motion.div>
            </div>

            {/* Insights Panel */}
            <motion.div variants={itemVariants} className="w-full bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <TrendingUp size={24} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Executive Insights</h3>
                  <p className="text-sm text-gray-400">Automated patterns detected by system AI</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <InsightTile
                  title="Peak Performance"
                  description={`Optimal utilization is at ${analytics.peakHours.peakHourLabel} with ${analytics.peakHours.peakOccupancy} events detected.`}
                  tag="Efficiency"
                />
                <InsightTile
                  title="Revenue Projection"
                  description={`Consistent daily growth of ₹${analytics.revenue.avgRevenuePerDay.toLocaleString()}. Projected monthly: ₹${Math.round(analytics.revenue.estimatedMonthlyRevenue).toLocaleString()}.`}
                  tag="Financial"
                />
                <InsightTile
                  title="System Reliability"
                  description={`AI engine maintaining ${analytics.aiAccuracy.accuracy.toFixed(1)}% accuracy with verified high confidence levels.`}
                  tag="Technical"
                />
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function AnalyticsCard({ icon, label, value, trend, trendUp, subtext, color }: any) {
  const configs: any = {
    cyan: "border-cyan-500/20 hover:border-cyan-500/40 bg-cyan-500/5",
    green: "border-green-500/20 hover:border-green-500/40 bg-green-500/5",
    purple: "border-purple-500/20 hover:border-purple-500/40 bg-purple-500/5",
    yellow: "border-yellow-500/20 hover:border-yellow-500/40 bg-yellow-500/5",
  };

  return (
    <div className={`p-6 rounded-3xl border transition-all duration-300 backdrop-blur-sm group ${configs[color]}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${trendUp ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>
          {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
        <p className="text-3xl font-black tracking-tighter text-white mb-2">{value}</p>
        <p className="text-xs text-gray-400 font-medium">{subtext}</p>
      </div>
    </div>
  );
}

function InsightTile({ title, description, tag }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 group hover:bg-white/[0.08] transition-all">
      <Badge className="mb-4 bg-white/10 text-white font-bold tracking-widest uppercase text-[10px] py-1 border-none">
        {tag}
      </Badge>
      <h4 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors uppercase tracking-tight">{title}</h4>
      <p className="text-sm text-gray-400 leading-relaxed font-medium">
        {description}
      </p>
    </div>
  );
}
