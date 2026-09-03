
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

        const lots = await prisma.parkinglot.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                ownerprofile: {
                    include: {
                        user: {
                            select: { name: true, email: true }
                        }
                    }
                },
                _count: {
                    select: { slots: true, booking: true }
                }
            }
        })

        const formattedLots = lots.map((lot: any) => ({
            id: lot.id,
            name: lot.name,
            address: lot.address,
            status: lot.status,
            ownerName: lot.ownerprofile?.user.name || "Unknown",
            ownerEmail: lot.ownerprofile?.user.email || "Unknown",
            totalSlots: lot.totalSlots,
            activeSlots: lot._count.slots,
            totalBookings: lot._count.booking,
            createdAt: lot.createdAt,
            coordinates: { lat: lot.lat, lng: lot.lng },
            // Edge Node Data
            edgeNodeId: lot.edgeNodeId,
            lastHeartbeat: lot.lastHeartbeat,
            ddnsDomain: lot.ddnsDomain,
            isOnline: lot.lastHeartbeat ? (new Date().getTime() - new Date(lot.lastHeartbeat).getTime() < 120000) : false
        }))

        return NextResponse.json(formattedLots)
    } catch (error) {
        console.error("Error fetching admin parking lots:", error)
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        )
    }
}
