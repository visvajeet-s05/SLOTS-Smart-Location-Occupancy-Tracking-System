"use server"

import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth-options"
import { getServerSession } from "next-auth"

export async function getUserBookings() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
        throw new Error("Unauthorized")
    }

    // 1. Get User ID from email
    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
    })

    if (!user) {
        throw new Error("User not found")
    }

    // 2. Fetch Bookings
    const bookings = await prisma.booking.findMany({
        where: {
            customerId: user.id
        },
        orderBy: {
            createdAt: 'desc'
        },
        include: {
            parkinglot: {
                select: {
                    name: true,
                    address: true
                }
            },
            slot: {
                select: {
                    slotNumber: true,
                    row: true
                }
            }
        }
        // We don't have vehicle relation directly populated often in lightweight apps without specific selection
        // But let's check schema. Booking has vehicleType, but not a direct vehicle relation necessarily used here? 
        // Schema says: "vehicleType String". 
    })

    return bookings
}
