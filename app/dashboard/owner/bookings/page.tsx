"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Calendar,
  Clock,
  Car,
  ChevronRight,
  Filter,
  Download,
  MoreVertical,
  CheckCircle2,
  Timer,
  AlertCircle,
  QrCode,
  FileText,
  History
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
// Removed date-fns import due to build error resolving internal modules
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Booking {
  id: string;
  customerId: string;
  status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  amount: number;
  startTime: string;
  endTime: string;
  vehicleType: string;
  user_booking_customerIdTouser: {
    name: string;
    email: string;
    phone: string | null;
  };
  slot: {
    slotNumber: number;
    row: string;
  } | null;
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

export default function OwnerBookingsPage() {
  const { data: session } = useSession();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  useEffect(() => {
    fetchBookings();
    // Refresh every 30 seconds for "real-time" feel without heavy sockets overhead for bookings
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await fetch("/api/owner/bookings");
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      }
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const matchesSearch =
        b.user_booking_customerIdTouser.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.slot?.slotNumber.toString().includes(searchQuery);

      const matchesFilter = filterStatus === "ALL" || b.status === filterStatus;

      return matchesSearch && matchesFilter;
    });
  }, [bookings, searchQuery, filterStatus]);

  const stats = useMemo(() => {
    return {
      active: bookings.filter(b => b.status === "ACTIVE").length,
      upcoming: bookings.filter(b => b.status === "UPCOMING").length,
      completed: bookings.filter(b => b.status === "COMPLETED").length,
      revenue: bookings.reduce((acc, curr) => acc + curr.amount, 0)
    };
  }, [bookings]);

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-purple-500/30">
      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-purple-900/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-blue-900/10 rounded-full blur-[100px]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative w-full px-4 sm:px-5 lg:px-6 pt-0 pb-20 space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 pt-1">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">Bookings</h1>
            <p className="text-gray-400">Manage and track all parking reservations in real-time</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11">
              <Download size={18} className="mr-2" /> Export JSON
            </Button>
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl h-11 px-6 shadow-lg shadow-purple-500/20">
              Refresh Data
            </Button>
          </div>
        </motion.div>

        {/* Quick Actions Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          <ActionTile
            title="Scan QR Entry"
            desc="Validate visitor entrance"
            icon={<QrCode className="text-purple-400" />}
            href="/dashboard/owner/bookings/qr"
          />
          <ActionTile
            title="Manual Booking"
            desc="Create entry for walk-ins"
            icon={<FileText className="text-blue-400" />}
            href="/dashboard/owner/bookings/manual"
          />
          <ActionTile
            title="Entry/Exit Logs"
            desc="System history records"
            icon={<History className="text-green-400" />}
            href="/dashboard/owner/bookings/logs"
          />
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <BookingStat title="Active" value={stats.active} icon={<Timer className="text-green-400" />} color="green" />
          <BookingStat title="Upcoming" value={stats.upcoming} icon={<Calendar className="text-blue-400" />} color="blue" />
          <BookingStat title="Completed" value={stats.completed} icon={<CheckCircle2 className="text-purple-400" />} color="purple" />
          <BookingStat title="Total Revenue" value={`₹${stats.revenue.toLocaleString()}`} icon={<AlertCircle className="text-yellow-400" />} color="yellow" />
        </motion.div>

        {/* Controls */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">
          <div className="relative w-full md:w-[38rem] group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
            <Input
              placeholder="Search by customer, id, or slot..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-white/10 pl-10 h-11 rounded-xl outline-none focus:ring-1 focus:ring-purple-500/30"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
            {["ALL", "ACTIVE", "UPCOMING", "COMPLETED", "CANCELLED"].map((status) => (
              <Button
                key={status}
                onClick={() => setFilterStatus(status)}
                variant={filterStatus === status ? "default" : "outline"}
                className={`rounded-full px-5 h-9 text-xs font-semibold whitespace-nowrap transition-all ${filterStatus === status
                  ? "bg-purple-600 hover:bg-purple-500 border-none shadow-lg shadow-purple-500/20"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                  }`}
              >
                {status}
              </Button>
            ))}
          </div>
        </motion.div>

        {/* Bookings Table */}
        <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Slot & Vehicle</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Arrival Time</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Status</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        </div>
                      </td>
                    </tr>
                  ) : filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Car className="text-gray-700 w-12 h-12" />
                          <p className="text-gray-500 font-medium">No reservations found matching your criteria</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBookings.map((booking) => (
                      <motion.tr
                        key={booking.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="group hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center font-bold text-purple-400">
                              {booking.user_booking_customerIdTouser.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-200 group-hover:text-purple-300 transition-colors uppercase tracking-tight">{booking.user_booking_customerIdTouser.name}</p>
                              <p className="text-xs text-gray-500 font-mono tracking-tighter">{booking.id.substring(0, 12)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-white/5 rounded-lg border border-white/10 shrink-0">
                              <Car size={16} className="text-gray-400" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                {booking.slot ? `${booking.slot.row}-${booking.slot.slotNumber}` : "PENDING"}
                              </p>
                              <p className="text-xs text-gray-500 uppercase tracking-widest">{booking.vehicleType}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
                              <Calendar size={14} className="text-blue-400" />
                              {new Date(booking.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <Clock size={14} className="text-gray-600" />
                              {new Date(booking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - {new Date(booking.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <StatusBadge status={booking.status} />
                        </td>
                        <td className="px-6 py-5 text-right font-mono font-bold text-gray-200">
                          ₹{booking.amount}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function ActionTile({ title, desc, icon, href }: any) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ x: 5, backgroundColor: "rgba(255,255,255,0.08)" }}
        whileTap={{ scale: 0.98 }}
        className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/5 rounded-xl group-hover:bg-white/10 transition-colors shadow-inner">
            {icon}
          </div>
          <div>
            <h3 className="font-bold text-gray-200 uppercase tracking-tight">{title}</h3>
            <p className="text-xs text-gray-500">{desc}</p>
          </div>
        </div>
        <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
      </motion.div>
    </Link>
  );
}

function BookingStat({ title, value, icon, color }: any) {
  const configs: any = {
    green: "from-green-500/10 to-transparent text-green-400 border-green-500/20",
    blue: "from-blue-500/10 to-transparent text-blue-400 border-blue-500/20",
    purple: "from-purple-500/10 to-transparent text-purple-400 border-purple-500/20",
    yellow: "from-yellow-500/10 to-transparent text-yellow-400 border-yellow-500/20",
  };

  return (
    <div className={`p-4 bg-gradient-to-br ${configs[color]} border rounded-2xl backdrop-blur-sm`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-white/5 rounded-lg">{icon}</div>
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</span>
      </div>
      <p className="text-2xl font-bold tracking-tighter text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
    UPCOMING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    COMPLETED: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${configs[status] || "bg-gray-500/10 text-gray-400 border-gray-500/20"} inline-flex items-center gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "ACTIVE" ? "bg-green-500 animate-pulse" : "bg-current"}`} />
      {status}
    </div>
  );
}
