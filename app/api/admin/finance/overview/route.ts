
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

export async function GET() {
    try {
        const session = await getServerSession(authOptions)

        if (!session || session.user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const [totalRevenue, successfulPaymentsCount, recentPayments] = await Promise.all([
            prisma.payment.aggregate({
                _sum: { amount: true },
                where: { status: "COMPLETED" }
            }),
            prisma.payment.count({ where: { status: "COMPLETED" } }),
            prisma.payment.findMany({
                take: 10,
                orderBy: { createdAt: "desc" },
            })
        ])

        // Fetch booking details for recent payments manually if needed or just return ID/Amount
        // payment usually links to booking which links to user/lot

        const enrichedPayments = await Promise.all(recentPayments.map(async (p) => {
            let details = "Direct Payment"
            if (p.bookingId) {
                const booking = await prisma.booking.findUnique({
                    where: { id: p.bookingId },
                    include: { user_booking_customerIdTouser: true, parkinglot: true }
                })
                if (booking) {
                    details = `${booking.user_booking_customerIdTouser.name} - ${booking.parkinglot.name}`
                }
            }
            return {
                ...p,
                details
            }
        }))

        return NextResponse.json({
            totalRevenue: totalRevenue._sum.amount || 0,
            successfulPayments: successfulPaymentsCount,
            recentPayments: enrichedPayments
        })
    } catch (error) {
        console.error("Error fetching admin finance:", error)
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        )
    }
}
