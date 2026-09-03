"use client";

import { motion } from "framer-motion";
import {
  FileText,
  Receipt,
  Landmark,
  ShieldCheck,
  ChevronRight,
  Download,
  PieChart,
  Wallet,
  ArrowUpRight,
  Calculator
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

export default function OwnerReportsPage() {
  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-purple-500/30">
      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-5%] right-[-5%] w-[35%] h-[35%] bg-purple-900/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[35%] h-[35%] bg-blue-900/10 rounded-full blur-[100px]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
         className="relative w-full max-w-[1440px] mx-auto px-6 lg:px-8 pt-0 pb-20 space-y-10"
      >
        {/* Header Section */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-purple-400 font-medium">
              <Calculator size={18} />
              <span className="text-sm tracking-wider uppercase">Financial Intelligence</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Financial Reports</h1>
            <p className="text-gray-400">Manage invoices, tax compliance, and revenue settlements</p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11 px-6">
              Download All
            </Button>
          </div>
        </motion.div>

        {/* Categories Grid */}
        <div className="grid w-full grid-cols-1 lg:grid-cols-3 gap-8">

          <motion.div variants={itemVariants} className="lg:col-span-2 w-full space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReportCard href="/dashboard/owner/reports/invoices" title="Business Invoices" desc="Monthly billing statements & itemized usage" icon={<Receipt className="text-indigo-400" />} color="indigo" />
              <ReportCard href="/dashboard/owner/reports/tax" title="Tax Compliance" desc="GST/VAT summaries and fiscal declarations" icon={<ShieldCheck className="text-emerald-400" />} color="emerald" />
              <ReportCard href="/dashboard/owner/reports/settlements" title="Bank Settlements" desc="Track direct deposits and payout history" icon={<Landmark className="text-amber-400" />} color="amber" />
              <ReportCard href="/dashboard/owner/reports/analytics-export" title="Custom Exports" desc="Generate raw data CSVs for external tools" icon={<FileText className="text-red-400" />} color="red" />
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold flex items-center gap-2"><PieChart size={20} className="text-indigo-400" />Pending Settlements</h3>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Next Payout: Feb 15</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Gross Unsettled</p>
                  <p className="text-3xl font-black text-white">₹0</p>
                  <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1"><ArrowUpRight size={12} /> ₹0 today</p>
                </div>
                <div className="w-px h-full bg-white/5 hidden md:block" />
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Processing Fee</p>
                  <p className="text-3xl font-black text-white">₹0</p>
                  <p className="text-[10px] text-gray-500 font-bold italic">0.00% applied rate</p>
                </div>
                <div className="w-px h-full bg-white/5 hidden md:block" />
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Net Payable</p>
                  <p className="text-3xl font-black text-indigo-400">₹0</p>
                  <p className="text-[10px] text-indigo-400/60 font-medium">No cleared payout pending</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Sidebar / Secondary Tools */}
          <motion.div variants={itemVariants} className="space-y-8">
            <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/10 border border-purple-500/20 rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-[-20px] right-[-20px] p-8 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
              <div className="relative z-10">
                <Wallet size={32} className="text-purple-400 mb-4" />
                <h3 className="text-lg font-bold mb-2">Payout Settings</h3>
                <p className="text-sm text-gray-400 mb-6 font-medium">Manage your bank account details and settlement schedule.</p>
                <Button className="w-full bg-white text-black hover:bg-gray-200 rounded-xl font-bold">Configure Bank</Button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Download size={18} className="text-gray-400" />
                Recent Downloads
              </h3>
              <div className="space-y-4">
                <DownloadItem name="Invoice_JAN_2026.pdf" size="1.2 MB" />
                <DownloadItem name="Tax_Report_Q4.zip" size="4.8 MB" />
                <DownloadItem name="Settlement_040226.csv" size="156 KB" />
              </div>
              <Button variant="link" className="text-purple-400 p-0 h-auto mt-6 text-xs font-bold uppercase tracking-widest hover:text-purple-300">
                View Archive →
              </Button>
            </div>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
}

function ReportCard({ href, title, desc, icon, color }: any) {
  const configs: any = {
    indigo: "hover:border-indigo-500/40 bg-indigo-500/[0.04]",
    emerald: "hover:border-emerald-500/40 bg-emerald-500/[0.04]",
    amber: "hover:border-amber-500/40 bg-amber-500/[0.04]",
    red: "hover:border-red-500/40 bg-red-500/[0.04]",
  };

  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -5 }}
         className={`w-full p-6 border border-white/10 rounded-3xl backdrop-blur-sm transition-all group ${configs[color]}`}
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 group-hover:scale-110 transition-transform mb-6">
            {icon}
          </div>
          <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
        </div>
        <h3 className="text-lg font-bold text-gray-200 group-hover:text-white transition-colors mb-1 uppercase tracking-tight">{title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed font-medium">
          {desc}
        </p>
      </motion.div>
    </Link>
  );
}

function DownloadItem({ name, size }: any) {
  return (
    <div className="flex items-center justify-between group cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
        <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate max-w-[140px]">{name}</span>
      </div>
      <span className="text-[10px] text-gray-600 font-mono">{size}</span>
    </div>
  );
}
