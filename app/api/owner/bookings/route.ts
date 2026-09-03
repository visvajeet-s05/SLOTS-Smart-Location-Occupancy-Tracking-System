import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { OWNER_PARKING_MAPPING } from "@/lib/owner-mapping";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || session.user.role !== "OWNER") {
            return NextResponse.json([], { status: 200 });
        }

        const ownerProfile = await prisma.ownerprofile.findUnique({
            where: { userId: session.user.id },
            select: { id: true, parkinglot: { select: { id: true } } }
        });

        const lotIds = ownerProfile?.parkinglot?.map((lot) => lot.id) ?? [];
        const fallbackLotId = OWNER_PARKING_MAPPING[session.user.email.toLowerCase()];

        if (lotIds.length === 0 && fallbackLotId) {
            lotIds.push(fallbackLotId);
        }

        const bookings = await prisma.booking.findMany({
            where: lotIds.length > 0
                ? { parkingLotId: { in: lotIds } }
                : { parkingLotId: "__not_found__" },
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                user_booking_customerIdTouser: {
                    select: {
                        name: true,
                        email: true,
                        phone: true
                    }
                },
                slot: {
                    select: {
                        slotNumber: true,
                        row: true
                    }
                }
            }
        });

        return NextResponse.json(bookings);
    } catch (error) {
        console.error("[OWNER_BOOKINGS_GET]", error);
        return NextResponse.json([], { status: 200 });
    }
}
