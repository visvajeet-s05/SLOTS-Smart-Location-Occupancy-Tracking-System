import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateBlockchainTransaction } from "@/lib/blockchain"

export async function POST(req: NextRequest) {
    try {
        const { bookingId, slotId, parkingLotId, paymentId } = await req.json()

        if (!bookingId || !slotId) {
            return new NextResponse("Missing required fields", { status: 400 })
        }

        console.log(`[CONFIRM_BOOKING] Finalizing booking ${bookingId} for slot ${slotId}`)

        // 1. Update Booking Status -> ACTIVE (or CONFIRMED)
        await prisma.booking.update({
            where: { id: bookingId },
            data: { status: "ACTIVE" } // or UPCOMING/CONFIRMED
        })

        // 2. Generate Blockchain Transaction Hash & Update Payment Status
        // Simulate Web3 Ledger Interaction
        const txHash = generateBlockchainTransaction({
            bookingId: bookingId,
            userId: "USER_SIMULATION",
            parkingLotId: parkingLotId || "UNKNOWN",
            amount: 50.0, // Default simulation amount
            timestamp: new Date().toISOString()
        });

        if (paymentId) {
            try {
                const payment = await prisma.payment.findFirst({
                    where: { bookingId: bookingId }
                })
                if (payment) {
                    await prisma.payment.update({
                        where: { id: payment.id },
                        data: { 
                            status: "COMPLETED", 
                            confirmedAt: new Date(),
                            txHash: txHash
                        }
                    })
                }
            } catch (e) {
                console.warn("Could not update payment status (might already be updated)", e)
            }
        }

        // 3. Mark Slot as RESERVED
        const slot = await prisma.slot.findUnique({ where: { id: slotId } })
        if (!slot) return new NextResponse("Slot not found", { status: 404 })

        const updatedSlot = await prisma.slot.update({
            where: { id: slotId },
            data: {
                status: "RESERVED",
                updatedAt: new Date(),
                // updatedBy: "CUSTOMER" // If your schema supports this
            }
        })

        const status = "RESERVED"

        // 4. Broadcast via WebSocket
        let wsUrl = process.env.INTERNAL_WS_SERVER_URL || 
                    process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace("wss://", "https://").replace("ws://", "http://") || 
                    "http://localhost:4000"

        // For backwards compatibility and safety, ensure we are using http/https for internal fetch
        if (wsUrl.startsWith("ws://")) {
            wsUrl = wsUrl.replace("ws://", "http://")
        } else if (wsUrl.startsWith("wss://")) {
            wsUrl = wsUrl.replace("wss://", "https://")
        }

        try {
            await fetch(`${wsUrl}/broadcast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "SLOT_UPDATE",
                    lotSlug: parkingLotId,
                    slotNumber: updatedSlot.slotNumber,
                    slotId: updatedSlot.id,
                    status: status,
                    oldStatus: slot.status,
                    source: "CUSTOMER",
                    bookingId: bookingId
                })
            })
        } catch (wsError) {
            console.error("Failed to broadcast confirmation:", wsError)
        }

        return NextResponse.json({ success: true, slot: updatedSlot })

    } catch (error) {
        console.error("[CONFIRM_BOOKING_ERROR]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
