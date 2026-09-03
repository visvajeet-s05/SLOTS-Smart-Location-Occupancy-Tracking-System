import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "OWNER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedLotId = searchParams.get("lotId");
    const days = parseInt(searchParams.get("days") || "7");

    const ownerProfile = await prisma.ownerprofile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, parkinglot: { select: { id: true } } }
    });

    const lotId = requestedLotId || ownerProfile?.parkinglot?.[0]?.id || null;
    if (!lotId) {
      return NextResponse.json({ success: false, error: "Owner has no linked parking lot" }, { status: 404 });
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const lot = await prisma.parkinglot.findUnique({
      where: { id: lotId },
      include: {
        slots: {
          include: {
            bookings: true,
          },
        },
      },
    });

    if (!lot) {
      return NextResponse.json(
        { error: `Parking lot not found: ${lotId}` },
        { status: 404 }
      );
    }

    // Fetch status logs separately for all slots in this lot
    const slotIds = lot.slots.map(s => s.id);
    const statusLogs = await prisma.slotStatusLog.findMany({
      where: {
        slotId: { in: slotIds },
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group status logs by slot
    const statusLogsBySlot = new Map<string, typeof statusLogs>();
    statusLogs.forEach(log => {
      if (!statusLogsBySlot.has(log.slotId)) {
        statusLogsBySlot.set(log.slotId, []);
      }
      statusLogsBySlot.get(log.slotId)!.push(log);
    });

    // Attach status logs to slots
    const slotsWithLogs = lot.slots.map(slot => ({
      ...slot,
      statusLogs: statusLogsBySlot.get(slot.id) || [],
    }));

    // Calculate analytics
    const analytics = {
      overview: calculateOverview(lot, slotsWithLogs),
      peakHours: calculatePeakHours(slotsWithLogs, startDate),
      occupancyTrends: calculateOccupancyTrends(slotsWithLogs, days),
      revenue: calculateRevenue(lot, slotsWithLogs, days),
      aiAccuracy: calculateAIAccuracy(slotsWithLogs, startDate),
      customerMetrics: calculateCustomerMetrics(slotsWithLogs),
    };

    return NextResponse.json({
      success: true,
      lotId,
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
      analytics,
    });
  } catch (error) {
    console.error("Error generating analytics:", error);
    return NextResponse.json(
      { error: "Failed to generate analytics" },
      { status: 500 }
    );
  }
}

// Calculate overview metrics
function calculateOverview(lot: any, slots: any[]) {
  const totalSlots = slots.length;
  const occupiedSlots = slots.filter((s: any) => s.status === "OCCUPIED").length;
  const availableSlots = slots.filter((s: any) => s.status === "AVAILABLE").length;
  const reservedSlots = slots.filter((s: any) => s.status === "RESERVED").length;

  const occupancyRate = totalSlots > 0 ? (occupiedSlots / totalSlots) * 100 : 0;

  return {
    totalSlots,
    occupiedSlots,
    availableSlots,
    reservedSlots,
    occupancyRate: Math.round(occupancyRate * 100) / 100,
    avgConfidence: calculateAverageConfidence(slots),
  };
}

// Calculate average AI confidence
function calculateAverageConfidence(slots: any[]) {
  const aiUpdates = slots.filter((s: any) => s.updatedBy === "AI" && s.aiConfidence > 0);
  if (aiUpdates.length === 0) return 100; // Default to 100 if no AI logs

  const totalConfidence = aiUpdates.reduce((sum: number, s: any) => sum + s.aiConfidence, 0);
  return Math.round((totalConfidence / aiUpdates.length) * 100) / 100;
}

// Calculate peak hours (24-hour breakdown)
function calculatePeakHours(slots: any[], startDate: Date) {
  const hourCounts = new Array(24).fill(0);

  slots.forEach((slot: any) => {
    slot.statusLogs.forEach((log: any) => {
      if (log.createdAt >= startDate && log.newStatus === "OCCUPIED") {
        const hour = new Date(log.createdAt).getHours();
        hourCounts[hour]++;
      }
    });
  });

  // Find peak hour
  let peakHour = 0;
  let maxCount = 0;
  hourCounts.forEach((count, hour) => {
    if (count > maxCount) {
      maxCount = count;
      peakHour = hour;
    }
  });

  return {
    hourlyData: hourCounts.map((count, hour) => ({
      hour,
      count,
      label: `${hour}:00 - ${hour + 1}:00`,
    })),
    peakHour,
    peakHourLabel: `${peakHour}:00 - ${peakHour + 1}:00`,
    peakOccupancy: maxCount,
  };
}

// Calculate occupancy trends over time
function calculateOccupancyTrends(slots: any[], days: number) {
  const trends = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];

    // Count status changes for this date
    const dayLogs = slots.flatMap((s: any) =>
      s.statusLogs.filter((log: any) =>
        log.createdAt.toISOString().startsWith(dateStr)
      )
    );

    const occupiedCount = dayLogs.filter((l: any) => l.newStatus === "OCCUPIED").length;
    const availableCount = dayLogs.filter((l: any) => l.newStatus === "AVAILABLE").length;

    trends.push({
      date: dateStr,
      occupied: occupiedCount,
      available: availableCount,
      total: occupiedCount + availableCount,
    });
  }

  return trends;
}

// Calculate revenue metrics
function calculateRevenue(lot: any, slots: any[], days: number) {
  const bookings = slots
    .filter((s: any) => s.bookings && s.bookings.length > 0)
    .flatMap((s: any) => s.bookings);

  const totalBookings = bookings.length;
  // Get average slot price or default to 50
  const avgPrice = slots.length > 0 ? (slots[0].price || 50) : 50;
  const totalRevenue = bookings.reduce((sum: number, b: any) => sum + (b.amount || avgPrice), 0);

  const avgRevenuePerDay = totalRevenue / days;
  const avgBookingsPerDay = totalBookings / days;

  return {
    totalRevenue,
    totalBookings,
    avgRevenuePerDay: Math.round(avgRevenuePerDay * 100) / 100,
    avgBookingsPerDay: Math.round(avgBookingsPerDay * 100) / 100,
    pricePerHour: avgPrice,
    estimatedMonthlyRevenue: avgRevenuePerDay * 30,
  };
}

// Calculate AI accuracy metrics
function calculateAIAccuracy(slots: any[], startDate: Date) {
  let correctPredictions = 0;
  let totalPredictions = 0;

  slots.forEach((slot: any) => {
    const aiLogs = slot.statusLogs.filter(
      (log: any) => log.updatedBy === "AI" && log.createdAt >= startDate
    );

    aiLogs.forEach((aiLog: any) => {
      totalPredictions++;

      // Check if there was a subsequent OWNER update that confirms/disproves AI
      const subsequentOwnerLog = slot.statusLogs.find(
        (log: any) =>
          log.updatedBy === "OWNER" &&
          log.createdAt > aiLog.createdAt &&
          log.createdAt.getTime() - aiLog.createdAt.getTime() < 5 * 60 * 1000 // Within 5 minutes
      );

      if (subsequentOwnerLog) {
        if (subsequentOwnerLog.newStatus === aiLog.newStatus) {
          correctPredictions++;
        }
      } else {
        correctPredictions++;
      }
    });
  });

  const accuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 100;

  return {
    totalPredictions,
    correctPredictions,
    accuracy: Math.round(accuracy * 100) / 100,
    confidence: calculateAverageConfidence(slots),
  };
}

// Calculate customer metrics
function calculateCustomerMetrics(slots: any[]) {
  const bookings = slots
    .filter((s: any) => s.bookings && s.bookings.length > 0)
    .flatMap((s: any) => s.bookings);

  const uniqueCustomers = new Set(bookings.map((b: any) => b.customerId)).size;
  const repeatCustomers = bookings.length > uniqueCustomers
    ? bookings.length - uniqueCustomers
    : 0;

  return {
    totalCustomers: uniqueCustomers,
    repeatCustomers,
    repeatRate: bookings.length > 0 ? Math.round((repeatCustomers / bookings.length) * 100) : 0,
    avgBookingDuration: 2.5, // Hours - placeholder
  };
}
