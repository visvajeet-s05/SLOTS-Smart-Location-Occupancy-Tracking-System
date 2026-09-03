import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return new NextResponse("User not found", { status: 404 })
    }

    const bookings = await prisma.booking.findMany({
      where: {
        customerId: user.id
      },
      orderBy: {
        startTime: 'desc'
      },
      include: {
        parkinglot: {
          select: {
            name: true,
            address: true,
            ownerprofile: {
              select: {
                businessName: true,
                phone: true
              }
            }
          }
        },
        slot: {
          select: {
            slotNumber: true,
            row: true,
            displayName: true
          }
        }
      }
    })

    const paymentData = await prisma.payment.findMany({
      where: { bookingId: { in: bookings.map(b => b.id) } },
      select: { bookingId: true, txHash: true }
    });
    const paymentMap = new Map(paymentData.map(p => [p.bookingId, p.txHash]));

    const now = new Date()

    // 1. Auto-process statuses based on current date & time
    const processedBookings = await Promise.all(bookings.map(async (b) => {
      let currentStatus = b.status

      if (currentStatus === "UPCOMING" || currentStatus === "ACTIVE") {
        if (now > b.endTime) {
          // If time is completely up, it goes to COMPLETED only if it was already ACTIVE.
          // If it was still UPCOMING by the time it ended, it was an abandoned unpaid booking.
          currentStatus = currentStatus === "ACTIVE" ? "COMPLETED" : "CANCELLED"
        } else if (now >= b.startTime && currentStatus === "UPCOMING") {
          // If startTime has passed and it's STILL UPCOMING, it means it was never paid/confirmed.
          // In this system, confirm/route.ts instantly marks paid bookings as ACTIVE.
          // So an UPCOMING booking that has started is an abandoned cart -> CANCELLED.
          currentStatus = "CANCELLED"
        }

        // If status changed due to time, persist it to DB
        if (currentStatus !== b.status) {
          try {
            await prisma.booking.update({
              where: { id: b.id },
              data: { status: currentStatus }
            })
            // Update slot status if booking is completed
            if (currentStatus === "COMPLETED" && b.slotId) {
              await prisma.slot.update({
                where: { id: b.slotId },
                data: { status: "AVAILABLE" }
              })
            }
          } catch (updateErr) {
            console.error(`Failed to auto-update booking ${b.id}:`, updateErr)
          }
        }
      }

      return {
        ...b,
        status: currentStatus
      }
    }))

    const mappedBookings = processedBookings.map(b => ({
      id: b.id,
      bookingId: b.id.substring(0, 8).toUpperCase(),
      parkingLocation: b.parkinglot.name,
      parkingAddress: b.parkinglot.address,
      ownerBusinessName: b.parkinglot.ownerprofile?.businessName || "Independent Owner",
      ownerPhone: b.parkinglot.ownerprofile?.phone || "N/A",
      slotId: b.slot ? (b.slot.displayName || `${b.slot.row}-${b.slot.slotNumber}`) : "N/A",
      bookingDate: b.startTime.toISOString(),
      bookingTime: new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: Math.round((new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / (1000 * 60 * 60)),
      licensePlate: "TN-EX-9999", // Can be dynamically joined via vehicle array if fully modeled
      vehicleModel: b.vehicleType,
      amount: b.amount,
      paymentMethod: "Online",
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      txHash: paymentMap.get(b.id) || null,
    }))

    return NextResponse.json(mappedBookings)
  } catch (error) {
    console.error("[BOOKINGS_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}


export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const body = await req.json()
    let { slotId, duration, amount, licensePlate, vehicleModel, parkingLotId, idempotencyKey } = body

    if (!slotId || !duration || !amount) {
      return new NextResponse("Missing required fields (slotId, duration, amount)", { status: 400 })
    }

    // Resolver: If parkingLotId is missing, try to find it via the Slot
    if (!parkingLotId && slotId) {
      const relatedSlot = await prisma.slot.findUnique({
        where: { id: slotId },
        select: { lotId: true }
      });
      if (relatedSlot) {
        parkingLotId = relatedSlot.lotId;
      }
    }

    if (!parkingLotId) {
      return new NextResponse("Parking Lot ID is required and could not be resolved", { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        vehicle: true
      }
    })

    if (!user) {
      return new NextResponse("User not found", { status: 404 })
    }

    // Find or create vehicle if license plate doesn't match existing
    let vehicleId = null
    const existingVehicle = user.vehicle.find(v => v.licensePlate === licensePlate)

    if (existingVehicle) {
      vehicleId = existingVehicle.id
    } else if (licensePlate) {
      const specificVehicleModel = vehicleModel || "Unknown Model"
      // Use a try-catch for vehicle creation to avoid race conditions or duplicates crashing the whole flow
      try {
        const newVehicle = await prisma.vehicle.create({
          data: {
            id: `VEH-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            userId: user.id,
            licensePlate: licensePlate,
            model: specificVehicleModel,
            make: "Unknown",
            color: "Unknown",
            updatedAt: new Date()
          }
        })
        vehicleId = newVehicle.id
      } catch (vErr) {
        console.error("Vehicle creation warning:", vErr);
        // Proceed without explicit vehicle ID linked if strictly necessary, or just use user-provided strings
      }
    }

    const startTime = new Date()
    const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000)

    // Fetch parking lot to get the owner's userId
    const parkingLot = await prisma.parkinglot.findUnique({
      where: { id: parkingLotId },
      include: {
        ownerprofile: {
          select: { userId: true }
        }
      }
    })

    if (!parkingLot) {
      return new NextResponse("Parking lot not found", { status: 404 })
    }

    // Check if ownerprofile exists
    // If data is inconsistent (parkingLot exists but no ownerProfile), we might need a fallback or fail.
    // Failing is safer for data integrity, but let's be descriptive.
    if (!parkingLot.ownerprofile) {
      console.error(`Parking lot ${parkingLotId} has no owner profile linked. Data integrity issue.`)
      return new NextResponse("Parking lot configuration error (No Linked Owner)", { status: 500 })
    }

    const bookingId = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`

    // B27a: Idempotency with proper transaction boundaries
    const booking = await prisma.$transaction(async (tx) => {
      // Check idempotency key INSIDE transaction
      if (idempotencyKey) {
        const existingKey = await tx.idempotencykeys.findUnique({
          where: {
            actionType_idempotencyKey: {
              actionType: "CREATE_BOOKING",
              idempotencyKey
            }
          }
        })
        
        if (existingKey) {
          const cachedResult = JSON.parse(existingKey.result)
          return cachedResult.booking
        }
      }
      
      // Create the booking
      const newBooking = await tx.booking.create({
        data: {
          id: bookingId,
          customerId: user.id,
          ownerId: parkingLot.ownerprofile.userId,
          parkingLotId: parkingLotId,
          slotId: slotId,
          startTime: startTime,
          endTime: endTime,
          amount: parseFloat(amount),
          vehicleType: vehicleModel || "Car",
          status: "UPCOMING",
          idempotencyKey,
        }
      })
      
      // Store idempotency result INSIDE the same transaction
      if (idempotencyKey) {
        try {
          await tx.idempotencykeys.create({
            data: {
              id: `idemp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              actionType: "CREATE_BOOKING",
              idempotencyKey,
              userId: user.id,
              result: JSON.stringify({ booking: newBooking }),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }
          })
        } catch (error: any) {
          // If unique constraint violation occurs, another request won the race
          // Query for the existing record and return its cached result
          if (error.code === 'P2002') {
            const existingKey = await tx.idempotencykeys.findUnique({
              where: {
                actionType_idempotencyKey: {
                  actionType: "CREATE_BOOKING",
                  idempotencyKey
                }
              }
            })
            if (existingKey) {
              const cachedResult = JSON.parse(existingKey.result)
              return cachedResult.booking
            }
          }
          throw error
        }
      }
      
      return newBooking
    })

    // Get current slot status for broadcast and update
    const slot = await prisma.slot.findUnique({
      where: { id: slotId }
    })

    if (slot) {
      // Update slot status
      const updatedSlot = await prisma.slot.update({
        where: { id: slotId },
        data: {
          status: "RESERVED",
          updatedAt: new Date()
        }
      })

      // Broadcast update via WebSocket server with TIMEOUT
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

        // Priority: Internal Railway URL -> Dedicated Public URL -> localhost
        let broadcastUrl = process.env.INTERNAL_WS_SERVER_URL || 
                           process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace("wss://", "https://").replace("ws://", "http://") || 
                           "http://localhost:4000"

        // For backwards compatibility and safety, ensure we are using http/https for internal fetch
        if (broadcastUrl.startsWith("ws://")) {
            broadcastUrl = broadcastUrl.replace("ws://", "http://")
        } else if (broadcastUrl.startsWith("wss://")) {
            broadcastUrl = broadcastUrl.replace("wss://", "https://")
        }

        await fetch(`${broadcastUrl}/broadcast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "SLOT_UPDATE",
            lotSlug: parkingLotId,
            slotNumber: updatedSlot.slotNumber,
            slotId: updatedSlot.id,
            status: "RESERVED",
            oldStatus: slot.status,
            source: "CUSTOMER",
            bookingId: booking.id
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId);
      } catch (wsError) {
        console.error("Failed to broadcast booking update (continued anyway):", wsError)
      }
    }

    return NextResponse.json(booking)

  } catch (error) {
    console.error("[BOOKINGS_POST] Critical Error:", error)
    // Return a JSON response even for 500 so frontend can parse it if possible, or at least text
    return new NextResponse(JSON.stringify({ error: "Internal Server Error", details: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}
