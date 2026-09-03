"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Camera,
  Grid3X3,
  Car,
  TrendingUp,
  AlertCircle,
  LayoutDashboard,
  Clock,
  ChevronRight,
  ShieldCheck,
  Signal,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Zap,
  History,
  MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOwnerWS } from "@/components/ws/OwnerWebSocketProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { OWNER_PARKING_MAPPING, PARKING_LOT_DETAILS } from "@/lib/owner-mapping"

// Mock data for occupancy chart
const MOCK_CHART_DATA = [
  { time: "00:00", occupancy: 20 },
  { time: "04:00", occupancy: 15 },
  { time: "08:00", occupancy: 45 },
  { time: "12:00", occupancy: 85 },
  { time: "16:00", occupancy: 92 },
  { time: "20:00", occupancy: 65 },
  { time: "23:59", occupancy: 30 },
];

type SlotStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "DISABLED";

type Slot = {
  id: string;
  slotNumber: number;
  status: SlotStatus;
};

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    occupied: 0,
    reserved: 0,
    disabled: 0,
  });
  const [edgeNode, setEdgeNode] = useState<{
    id: string | null;
    isOnline: boolean;
    lastHeartbeat: string | null;
    ddnsDomain: string | null;
  }>({ id: null, isOnline: false, lastHeartbeat: null, ddnsDomain: null });
  const [activityLog, setActivityLog] = useState<{ id: string; msg: string; time: string; type: 'entry' | 'exit' }[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [msPulse, setMsPulse] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedView, setSelectedView] = useState<"today" | "week">("today");
  const [apiHealthy, setApiHealthy] = useState(true);
  const { isConnected: wsConnected, lastMessage } = useOwnerWS();

  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const ownerEmail = (session?.user?.email || "").toLowerCase();
  const parkingLotId = session?.user?.parkingLotId || OWNER_PARKING_MAPPING[ownerEmail];
  const displayLotKey = OWNER_PARKING_MAPPING[ownerEmail] || session?.user?.parkingLotId;
  const lotDetails = (displayLotKey && PARKING_LOT_DETAILS[displayLotKey]) || { name: session?.user?.name || "Your Parking Lot", location: "Unknown Location", price: 0 };

  useEffect(() => {
    // High-frequency UI tick (every 10ms) for millisecond feel
    const msTimer = setInterval(() => {
      setMsPulse(Date.now() % 1000);
    }, 10);

    // Standard clock update
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    // Automatic background 'refresh' (re-fetch data) every 10 seconds
    const dataRefreshTimer = setInterval(() => {
      console.log("🔄 Auto-refreshing dashboard data...");
      fetchStats();
    }, 10000);

    return () => {
      clearInterval(msTimer);
      clearInterval(timer);
      clearInterval(dataRefreshTimer);
    };
  }, []);

  const fetchStats = useCallback(() => {
    if (!parkingLotId) return;

    fetch(`/api/owner/bookings`)
      .then((res) => res.ok ? res.json() : [])
      .then((bookings) => {
        setRecentBookings(Array.isArray(bookings) ? bookings.slice(0, 3) : []);
      })
      .catch(() => setRecentBookings([]));

    fetch(`/api/parking/${parkingLotId}/slots`)
      .then((res) => {
        if (!res.ok) setApiHealthy(false);
        return res.json();
      })
      .then((data) => {
        setApiHealthy(true);
        const slots: Slot[] = data.slots || [];
        setSlots(slots);
        setStats({
          total: slots.length,
          available: slots.filter((s) => s.status === "AVAILABLE").length,
          occupied: slots.filter((s) => s.status === "OCCUPIED").length,
          reserved: slots.filter((s) => s.status === "RESERVED").length,
          disabled: slots.filter((s) => s.status === "DISABLED").length,
        });

        fetch(`/api/parking`)
          .then((res) => {
            if (!res.ok) {
              if (res.status === 401 || res.status === 403) {
                throw new Error("Authentication failed or unauthorized access.");
              } else if (res.status === 404) {
                throw new Error("Parking API endpoint not found.");
              }
              throw new Error(`HTTP ${res.status}`);
            }
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              throw new Error("API returned non-JSON response");
            }
            return res.json();
          })
          .then((lotData) => {
            if (!lotData.parkingAreas) {
              console.warn("⚠️ No parking areas returned from API");
              return;
            }

            const pid = (parkingLotId || "").toString().trim().toUpperCase();
            const currentLot = lotData.parkingAreas?.find((l: any) =>
              l.id?.toString().trim().toUpperCase() === pid
            );

            if (currentLot) {
              console.log(`✅ Found lot: ${currentLot.name} (Online: ${currentLot.isOnline})`);
              setEdgeNode({
                id: currentLot.edgeNodeId,
                isOnline: currentLot.isOnline || false,
                lastHeartbeat: currentLot.lastHeartbeat,
                ddnsDomain: currentLot.ddnsDomain
              });
            } else {
              console.warn(`⚠️ Lot ${pid} not found in ${lotData.parkingAreas.length} results`);
              if (lotData.parkingAreas.length === 1) {
                const onlyLot = lotData.parkingAreas[0];
                setEdgeNode({
                  id: onlyLot.edgeNodeId,
                  isOnline: onlyLot.isOnline || false,
                  lastHeartbeat: onlyLot.lastHeartbeat,
                  ddnsDomain: onlyLot.ddnsDomain
                });
              }
            }
          })
          .catch((err) => {
            console.error("❌ Failed to fetch detailed status:", err);
          });
      })
      .catch((err) => console.error("Failed to fetch slots stats:", err));
  }, [parkingLotId]);

  useEffect(() => {
    if (!parkingLotId || hasFetchedRef.current || isFetchingRef.current) return;
    hasFetchedRef.current = true;
    fetchStats();
  }, [parkingLotId, fetchStats]);

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "SLOT_UPDATE") return;

    // Update Logs
    const newLog = {
      id: Math.random().toString(36).substr(2, 9),
      msg: `Slot ${lastMessage.slotNumber || lastMessage.slotId} ${lastMessage.status === 'OCCUPIED' ? 'Occupied' : 'Cleared'}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: lastMessage.status === 'OCCUPIED' ? 'entry' as const : 'exit' as const
    };
    setActivityLog(prev => [newLog, ...prev].slice(0, 10));

    setStats((prev) => {
      const newStats = { ...prev };
      if (lastMessage.oldStatus) {
        const oldKey = lastMessage.oldStatus.toLowerCase() as keyof typeof stats;
        if (newStats[oldKey] !== undefined) newStats[oldKey]--;
      }
      const newKey = lastMessage.status?.toLowerCase() as keyof typeof stats;
      if (newKey && newStats[newKey] !== undefined) newStats[newKey]++;
      return newStats;
    });

    // Update slots array for real-time chart
    if (lastMessage.slotId || lastMessage.slotNumber) {
      setSlots(prevSlots => {
        const newSlots = prevSlots.map(slot => {
          const matches = lastMessage.slotId 
            ? slot.id === lastMessage.slotId
            : slot.slotNumber === lastMessage.slotNumber;
          if (matches) {
            return {
              ...slot,
              status: lastMessage.status as SlotStatus,
              aiConfidence: lastMessage.confidence,
              updatedBy: lastMessage.updatedBy,
            };
          }
          return slot;
        });
        return newSlots;
      });
    }

  }, [lastMessage]);

  const occupancyPercentage = useMemo(() => {
    if (stats.total === 0) return 0;
    return Math.round(((stats.occupied + stats.reserved) / stats.total) * 100);
  }, [stats]);

  const revenueToday = useMemo(() => recentBookings.reduce((sum, booking) => sum + Number(booking.amount || 0), 0), [recentBookings]);
  const isLiveFeedHealthy = wsConnected && edgeNode.isOnline;
  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ background: "var(--accent-glow)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ background: "rgba(108, 92, 231, 0.08)" }} />
      </div>

      <div className="max-w-[1440px] mx-auto px-6 lg:px-8 py-8 space-y-8 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6" style={{ borderColor: "var(--border-glass)" }}>
          <div>
            <h1 className="text-[clamp(2.3rem,4vw,4rem)] font-black leading-none tracking-[-0.04em]">
              Hello, <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, var(--accent), #9f8cff)" }}>{session?.user?.name || "Partner"}</span>
            </h1>
            <div className="flex items-center gap-2 mt-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--status-live)" }}></span>
              <span>Monitoring: <strong style={{ color: "var(--text-primary)" }}>{lotDetails.name}</strong></span>
              <span style={{ color: "var(--border-glass)" }}>•</span>
              <span>{lotDetails.location}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-xs" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--text-muted)" }}>LOCAL TIME:</span>
              <span style={{ color: "var(--text-primary)" }} className="font-bold">{formattedTime}</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-xs font-semibold border ${isLiveFeedHealthy ? "" : ""}`} style={{
              background: isLiveFeedHealthy ? "rgba(108, 92, 231, 0.08)" : "rgba(245, 158, 11, 0.08)",
              borderColor: isLiveFeedHealthy ? "rgba(108, 92, 231, 0.24)" : "rgba(245, 158, 11, 0.24)",
              color: isLiveFeedHealthy ? "var(--accent-hover)" : "#fbbf24"
            }}>
              <span className={`w-2 h-2 rounded-full ${isLiveFeedHealthy ? "animate-pulse" : "animate-pulse"}`} style={{ background: isLiveFeedHealthy ? "var(--status-live)" : "#fbbf24" }}></span>
              <span>{isLiveFeedHealthy ? "LIVE UPDATES" : "DEGRADED FEED"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-[22px] flex flex-col justify-between space-y-3 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
            <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
              <span className="text-xs font-mono uppercase tracking-wider">Total Capacity</span>
              <div className="p-2.5 rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}>
                <Grid3X3 className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-[2.2rem] font-black font-mono leading-none" style={{ color: "var(--text-primary)" }}>{stats.total}</div>
              <span className="text-[11px] font-mono mt-2 block" style={{ color: "var(--text-muted)" }}>Maximum Facility Slots</span>
            </div>
          </div>

          <div className="p-5 rounded-[22px] flex flex-col justify-between space-y-3 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
            <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
              <span className="text-xs font-mono uppercase tracking-wider">Slots Available</span>
              <div className="p-2.5 rounded-xl" style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
                <Car className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-[2.2rem] font-black font-mono leading-none" style={{ color: "#10b981" }}>{stats.available}</div>
              <span className="text-[11px] font-mono mt-2 block" style={{ color: "#34d399" }}>
                {stats.total > 0 ? `${Math.round((stats.available / stats.total) * 100)}% Free` : '0% Free'} • Instant Refresh
              </span>
            </div>
          </div>

          <div className="p-5 rounded-[22px] flex flex-col justify-between space-y-3 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
            <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
              <span className="text-xs font-mono uppercase tracking-wider">Live Occupancy</span>
              <div className="p-2.5 rounded-xl" style={{ background: "rgba(108, 92, 231, 0.1)", color: "var(--accent)" }}>
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-[2.2rem] font-black font-mono leading-none" style={{ color: "var(--text-primary)" }}>{stats.occupied} <span className="text-lg font-normal align-middle" style={{ color: "var(--text-muted)" }}>/ {stats.total}</span></div>
              <span className="text-[11px] font-mono mt-2 block" style={{ color: "var(--text-muted)" }}>{occupancyPercentage}% Peak Load</span>
            </div>
          </div>

          <div className="p-5 rounded-[22px] flex flex-col justify-between space-y-3 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
            <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
              <span className="text-xs font-mono uppercase tracking-wider">Revenue Today</span>
              <div className="p-2.5 rounded-xl" style={{ background: "rgba(245, 158, 11, 0.1)", color: "#fbbf24" }}>
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-[2.2rem] font-black font-mono leading-none" style={{ color: "var(--text-primary)" }}>₹{revenueToday.toLocaleString()}</div>
              <span className="text-[11px] font-mono mt-2 block" style={{ color: "var(--text-muted)" }}>Booked Revenue Today</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-8">
            <div className="p-6 rounded-[28px] border space-y-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Occupancy Analytics</h3>
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
                      wsConnected
                        ? "bg-green-500/10 border-green-500/20 text-green-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}>
                      {wsConnected ? "LIVE" : "OFFLINE"}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {selectedView === "today"
                      ? "Real-time slot status distribution"
                      : "Occupancy trend over 24 hours"}
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl border text-xs font-mono" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                  <button
                    onClick={() => setSelectedView("today")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      selectedView === "today"
                        ? "shadow-lg shadow-cyan-500/20"
                        : "text-gray-400 hover:text-white"
                    }`}
                    style={{ background: selectedView === "today" ? "var(--accent)" : "transparent", color: selectedView === "today" ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setSelectedView("week")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      selectedView === "week"
                        ? "shadow-lg shadow-cyan-500/20"
                        : "text-gray-400 hover:text-white"
                    }`}
                    style={{ background: selectedView === "week" ? "var(--accent)" : "transparent", color: selectedView === "week" ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    Week
                  </button>
                </div>
              </div>

              {selectedView === "today" ? (
                <div className="h-64 w-full relative">
                  <div className="flex items-end h-48 gap-3 mb-4">
                    {[
                      { label: "Occupied", value: stats.occupied, color: "#EF4444" },
                      { label: "Available", value: stats.available, color: "#10B981" },
                      { label: "Reserved", value: stats.reserved, color: "#F59E0B" },
                      { label: "Disabled", value: stats.disabled, color: "#6B7280" },
                    ].map((item) => {
                      const percentage = stats.total > 0 ? (item.value / stats.total) * 100 : 0;
                      return (
                        <div key={item.label} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full rounded-lg transition-all duration-500 relative group cursor-default"
                            style={{
                              height: `${Math.max(percentage, 3)}%`,
                              background: item.color,
                              minHeight: "4px",
                            }}
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              {item.value}
                            </span>
                          </div>
                          <span className="text-xs mt-2 font-mono" style={{ color: item.color }}>{item.value}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono pt-2 border-t" style={{ color: "var(--text-muted)", borderColor: "var(--border-glass)" }}>
                    <span>Occupied</span>
                    <span>Available</span>
                    <span>Reserved</span>
                    <span>Disabled</span>
                  </div>
                </div>
              ) : (
                <div className="h-72 w-full relative pt-4">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradientWeek" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="150" x2="500" y2="150" stroke="var(--border-glass)" strokeWidth="1" />
                    {Array.from({ length: 6 }).map((_, i) => (
                      <line key={i} x1={i * 100} y1="0" x2={i * 100} y2="150" stroke="var(--border-glass)" strokeWidth="1" opacity="0.3" />
                    ))}
                    <path
                      d={`M 0 ${150 - (MOCK_CHART_DATA[0].occupancy * 1.5)} ${MOCK_CHART_DATA.slice(1).map((d, i) =>
                        `L ${(i + 1) * (500 / (MOCK_CHART_DATA.length - 1))} ${150 - (d.occupancy * 1.5)}`
                      ).join(" ")} L 500 150 L 0 150 Z`}
                      fill="url(#chartGradientWeek)"
                      stroke="none"
                    />
                    <path
                      d={`M 0 ${150 - (MOCK_CHART_DATA[0].occupancy * 1.5)} ${MOCK_CHART_DATA.slice(1).map((d, i) =>
                        `L ${(i + 1) * (500 / (MOCK_CHART_DATA.length - 1))} ${150 - (d.occupancy * 1.5)}`
                      ).join(" ")}`}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                    {MOCK_CHART_DATA.map((d, i) => {
                      const x = i * (500 / (MOCK_CHART_DATA.length - 1));
                      const y = 150 - (d.occupancy * 1.5);
                      return (
                        <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />
                      );
                    })}
                  </svg>
                  <div className="flex justify-between text-[10px] font-mono pt-3 border-t" style={{ color: "var(--text-muted)", borderColor: "var(--border-glass)" }}>
                    {MOCK_CHART_DATA.map((d) => <span key={d.time}>{d.time}</span>)}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 rounded-[28px] border space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Recent Bookings</h3>
                <Link href="/dashboard/owner/bookings">
                  <button className="text-xs font-mono" style={{ color: "var(--accent-hover)" }}>View All →</button>
                </Link>
              </div>

              <div className="divide-y divide-white/10">
                {recentBookings.length === 0 ? (
                  <div className="py-10 text-center" style={{ color: "var(--text-muted)" }}>No recent bookings yet.</div>
                ) : recentBookings.map((booking) => (
                  <div key={booking.id} className="py-3.5 flex items-center justify-between px-3 rounded-xl transition-colors hover:opacity-90" style={{ background: "transparent" }}>
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg border text-xs font-bold font-mono" style={{ background: "rgba(108, 92, 231, 0.1)", borderColor: "rgba(108, 92, 231, 0.2)", color: "var(--accent-hover)" }}>{booking.slot?.slotNumber ? `S${booking.slot.slotNumber}` : "LOT"}</span>
                      <div>
                        <p className="text-sm font-semibold font-mono" style={{ color: "var(--text-primary)" }}>{booking.user_booking_customerIdTouser?.name || booking.customerId}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{new Date(booking.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono" style={{ color: "#34d399" }}>₹{Number(booking.amount || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-[28px] border space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Control Center</h3>

              <Link href="/dashboard/owner/camera">
                <div className="p-4 rounded-xl border space-y-2 transition-colors cursor-pointer" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold font-mono" style={{ color: "var(--text-primary)" }}>LIVE SURVEILLANCE</h4>
                    <span className="p-1.5 rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}>📷</span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Access 4K AI-powered camera feeds</p>
                  <button className="text-xs font-mono pt-1 block" style={{ color: "var(--accent-hover)" }}>OPEN CONTROLS ›</button>
                </div>
              </Link>

              <Link href={parkingLotId ? `/dashboard/owner/parking-lots/${parkingLotId}/slots` : "/dashboard/owner/parking-lots/slots"}>
                <div className="p-4 rounded-xl border space-y-2 transition-colors cursor-pointer" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold font-mono" style={{ color: "var(--text-primary)" }}>SLOT MANAGEMENT</h4>
                    <span className="p-1.5 rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}>🎛️</span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Override status and configure limits</p>
                  <button className="text-xs font-mono pt-1 block" style={{ color: "var(--accent-hover)" }}>OPEN CONTROLS ›</button>
                </div>
              </Link>
            </div>

            <div className="p-6 rounded-[28px] border space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Live Activity</h3>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${wsConnected ? "animate-pulse" : ""}`} style={{ background: wsConnected ? "var(--status-live)" : "#f87171" }}></span>
                    <span className="text-[10px] font-mono" style={{ color: wsConnected ? "#34d399" : "#f87171" }}>{wsConnected ? "LIVE" : "OFFLINE"}</span>
                  </div>
                </div>

              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                <AnimatePresence mode="popLayout">
                  {activityLog.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>{wsConnected ? "Waiting for AI events..." : "WebSocket disconnected - waiting for events..."}</p>
                  ) : (
                    activityLog.map((log) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex items-start gap-3 p-2 rounded-xl border"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}
                      >
                        <div className="mt-1 p-1 rounded-md" style={{ background: log.type === 'entry' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)', color: log.type === 'entry' ? '#f87171' : '#34d399' }}>
                          <Zap size={10} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{log.msg}</p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{log.time}</p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="p-6 rounded-[28px] border space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono font-bold" style={{ color: "var(--text-primary)" }}>System Status</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ background: !edgeNode.isOnline ? "rgba(229, 72, 77, 0.08)" : "rgba(16, 185, 129, 0.08)", borderColor: !edgeNode.isOnline ? "rgba(229, 72, 77, 0.2)" : "rgba(16, 185, 129, 0.2)", color: !edgeNode.isOnline ? "#f87171" : "#34d399" }}>
                  {!edgeNode.isOnline ? 'Attention Required' : 'All Systems Operational'}
                </span>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div className="flex justify-between items-center py-1">
                  <span style={{ color: "var(--text-secondary)" }}>AI Edge Node</span>
                  <span className="px-2 py-0.5 rounded border text-[10px]" style={{ background: edgeNode.isOnline ? "rgba(16, 185, 129, 0.08)" : "rgba(229, 72, 77, 0.08)", borderColor: edgeNode.isOnline ? "rgba(16, 185, 129, 0.2)" : "rgba(229, 72, 77, 0.2)", color: edgeNode.isOnline ? "#34d399" : "#f87171" }}>
                    {edgeNode.isOnline ? 'OPERATIONAL' : 'SERVICE DOWN'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span style={{ color: "var(--text-secondary)" }}>Camera Processing</span>
                  <span className="px-2 py-0.5 rounded border text-[10px]" style={{ background: edgeNode.isOnline ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)", borderColor: edgeNode.isOnline ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)", color: edgeNode.isOnline ? "#34d399" : "#fbbf24" }}>
                    {edgeNode.isOnline ? 'OPERATIONAL' : 'ISSUE DETECTED'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span style={{ color: "var(--text-secondary)" }}>WebSocket Gateway</span>
                  <span className="px-2 py-0.5 rounded border text-[10px]" style={{ background: wsConnected ? "rgba(16, 185, 129, 0.08)" : "rgba(229, 72, 77, 0.08)", borderColor: wsConnected ? "rgba(16, 185, 129, 0.2)" : "rgba(229, 72, 77, 0.2)", color: wsConnected ? "#34d399" : "#f87171" }}>
                    {wsConnected ? 'OPERATIONAL' : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span style={{ color: "var(--text-secondary)" }}>Database Sync</span>
                  <span className="px-2 py-0.5 rounded border text-[10px]" style={{ background: apiHealthy ? "rgba(16, 185, 129, 0.08)" : "rgba(229, 72, 77, 0.08)", borderColor: apiHealthy ? "rgba(16, 185, 129, 0.2)" : "rgba(229, 72, 77, 0.2)", color: apiHealthy ? "#34d399" : "#f87171" }}>{apiHealthy ? 'OPERATIONAL' : 'SYNC FAILED'}</span>
                </div>
              </div>

              {edgeNode.id && (
                <div className="pt-4 border-t space-y-2" style={{ borderColor: "var(--border-glass)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Node ID</span>
                    <span className="text-[10px] font-mono" style={{ color: "var(--accent-hover)" }}>{edgeNode.id}</span>
                  </div>
                  {edgeNode.ddnsDomain && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Node Domain</span>
                      <span className="text-[10px] font-mono" style={{ color: "var(--accent-hover)" }}>{edgeNode.ddnsDomain}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
