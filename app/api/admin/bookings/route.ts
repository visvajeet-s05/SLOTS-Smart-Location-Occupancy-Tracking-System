
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session || session.user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const status = searchParams.get("status")
        const search = searchParams.get("search")

        const where: any = {}
        if (status && status !== "ALL") {
            where.status = status
        }
        if (search) {
            where.OR = [
                { id: { contains: search } },
                { user_booking_customerIdTouser: { email: { contains: search } } }, // customer email
                { parkinglot: { name: { contains: search } } } // parking name
            ]
        }

        const bookings = await prisma.booking.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 50, // Limit for performance
            include: {
                user_booking_customerIdTouser: {
                    select: { name: true, email: true }
                },
                parkinglot: {
                    select: { name: true, ownerprofile: { select: { businessName: true } } }
                }
            }
        })

        const formattedBookings = bookings.map(b => ({
            id: b.id,
            customerName: b.user_booking_customerIdTouser.name,
            customerEmail: b.user_booking_customerIdTouser.email,
            ownerBusiness: b.parkinglot.ownerprofile?.businessName || b.parkinglot.name,
            parkingLot: b.parkinglot.name,
            amount: b.amount,
            status: b.status,
            startTime: b.startTime,
            endTime: b.endTime,
            createdAt: b.createdAt
        }))

        return NextResponse.json(formattedBookings)
    } catch (error) {
        console.error("Error fetching admin bookings:", error)
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        )
    }
}
