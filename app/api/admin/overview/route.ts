
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

export async function GET() {
    try {
        const session = await getServerSession(authOptions)

        if (!session || session.user?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const [
            totalUsers,
            totalOperators,
            totalCustomers, // Keep user.count separated
            totalBookings,
            totalRevenueAggregate,
            recentSignups,
            pendingOwners,
            totalParkingLots,
            activeParkingLots,
            recentBookings
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { role: "OWNER" as any } }),
            prisma.user.count({ where: { role: "CUSTOMER" as any } }),
            prisma.booking.count(),
            prisma.payment.aggregate({
                _sum: {
                    amount: true,
                },
                where: {
                    status: "COMPLETED",
                },
            }),
            prisma.user.findMany({
                take: 5,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    createdAt: true,
                    role: true,
                },
            }),
            prisma.ownerprofile.count({
                where: { status: { in: ["OWNER_ONBOARDING", "KYC_PENDING"] } },
            }),
            prisma.parkinglot.count(),
            prisma.parkinglot.count({ where: { status: "ACTIVE" } }),
            prisma.booking.findMany({
                take: 5,
                orderBy: { createdAt: "desc" },
                include: {
                    user_booking_customerIdTouser: { select: { name: true, email: true } },
                    parkinglot: { select: { name: true } },
                },
            }),
        ])

        const totalRevenue = totalRevenueAggregate._sum.amount || 0

        return NextResponse.json({
            metrics: {
                totalUsers,
                totalOperators,
                totalCustomers,
                totalBookings,
                totalRevenue,
                pendingOwnerApprovals: pendingOwners,
                totalParkingLots,
                activeParkingLots,
            },
            lists: {
                recentSignups,
                recentBookings: recentBookings.map(b => ({
                    id: b.id,
                    customer: b.user_booking_customerIdTouser?.name || "Unknown",
                    parkingLot: b.parkinglot?.name || "Unknown",
                    status: b.status,
                    amount: b.amount,
                    date: b.createdAt,
                })),
            },
        })
    } catch (error) {
        console.error("Error fetching admin overview:", error)
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        )
    }
}
