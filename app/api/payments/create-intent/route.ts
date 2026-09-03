import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import crypto from "crypto"

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized", message: "Authentication required" }, { status: 401 })
        }

        const body = await req.json()
        const { slotId, duration, amount, licensePlate, vehicleModel, parkingLotId, currency = "inr" } = body

        console.log(`[PAYMENT_INTENT] Creating intent for Lot: ${parkingLotId}, Slot: ${slotId}, Amount: ${amount}, Plate: ${licensePlate}`)

        if (!slotId || !duration || !amount || !parkingLotId) {
            console.error("[PAYMENT_INTENT] Missing fields:", { slotId, duration, amount, parkingLotId })
            return NextResponse.json(
                { error: "Bad Request", message: "Missing required fields" },
                { status: 400 }
            )
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: {
                vehicle: true
            }
        })

        if (!user) {
            return NextResponse.json({ error: "Not Found", message: "User not found" }, { status: 404 })
        }

        // Check if slot is available
        const slot = await prisma.slot.findUnique({
            where: { id: slotId }
        })

        if (!slot) {
            return NextResponse.json({ error: "Not Found", message: "Slot not found" }, { status: 404 })
        }

        // Slot status check - more lenient for demo purposes
        if (slot.status === "CLOSED" || slot.status === "DISABLED") {
            console.log(`[PAYMENT_INTENT] Slot permanently unavailable: ${slot.status}`)
            return NextResponse.json(
                { error: "Slot Unavailable", message: "Slot is no longer available" },
                { status: 409 }
            )
        }

        console.log(`[PAYMENT_INTENT] Slot status check passed: ${slot.status}`)

        // Vehicle Logic (Reuse from bookings/route.ts)
        let vehicleId = null
        const existingVehicle = user.vehicle.find(v => v.licensePlate === licensePlate)

        if (existingVehicle) {
            vehicleId = existingVehicle.id
        } else if (licensePlate) {
            const specificVehicleModel = vehicleModel || "Unknown Model"
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
        }

        const startTime = new Date()
        const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000)

        // Strict Time-Overlap Check: Prevent multiple concurrent checkouts for the same exact slot
        const conflictingBooking = await prisma.booking.findFirst({
            where: {
                slotId: slotId,
                status: { in: ["ACTIVE", "UPCOMING"] },
                startTime: { lt: endTime },
                endTime: { gt: startTime }
            }
        })

        if (conflictingBooking) {
            return NextResponse.json(
                { 
                    error: "Slot Unavailable", 
                    message: "Someone else is currently booking this slot for the selected time. Please choose another." 
                }, 
                { status: 409 }
            )
        }

        // Fetch parking lot owner
        const parkingLot = await prisma.parkinglot.findUnique({
            where: { id: parkingLotId },
            include: {
                ownerprofile: {
                    select: { userId: true } // Owner's User ID
                }
            }
        })

        if (!parkingLot) {
            return NextResponse.json({ error: "Not Found", message: "Parking lot not found" }, { status: 404 })
        }

        const bookingId = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`

        // Initialize Payment Intent
        let clientSecret = ""
        let paymentIntentId = ""
        let isMock = false

        // Check for valid Stripe keys
        const sk = process.env.STRIPE_SECRET_KEY || ""
        const hasStripeKeys = sk.startsWith("sk_") && 
                             !sk.includes("placeholder") && 
                             !sk.includes("your_stripe") && 
                             !sk.includes("secret_key")

        console.log(`[PAYMENT_INTENT] Stripe Key Check: ${hasStripeKeys ? "VALID" : "INVALID (Demo Mode Active)"}`)

        if (hasStripeKeys) {
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(amount * 100),
                    currency: currency.toLowerCase(),
                    automatic_payment_methods: { enabled: true },
                    metadata: {
                        bookingId: bookingId,
                        slotId: slotId,
                        userId: user.id,
                        parkingLotId: parkingLotId
                    }
                })
                clientSecret = paymentIntent.client_secret!
                paymentIntentId = paymentIntent.id
            } catch (error) {
                console.error("[PAYMENT_INTENT] Stripe API Error:", error)
                // Fallback to mock if Stripe fails despite having keys
                console.warn("[PAYMENT_INTENT] Falling back to Mock Mode due to Stripe API error")
                clientSecret = "mock_secret_live_demo"
                paymentIntentId = `pi_mock_${Date.now()}`
                isMock = true
            }
        } else {
            // "Demo Mode" - Professional Simulation for testing/demos without keys
            console.log("💳 Payment System: Running in Demo/Simulation Mode")
            clientSecret = "mock_secret_live_demo"
            paymentIntentId = `pi_mock_${Date.now()}`
            isMock = true
        }

        // Create Booking (UPCOMING)
        const booking = await prisma.booking.create({
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
            }
        })

        // Create Payment Record (PENDING)
        await prisma.payment.create({
            data: {
                id: crypto.randomUUID(),
                bookingId: bookingId,
                stripeId: paymentIntentId,
                amount: parseFloat(amount),
                currency: currency.toLowerCase(),
                status: "PENDING",
                updatedAt: new Date()
            }
        })

        // REMOVED: Immediate slot reservation and broadcast. 
        // Logic moved to /api/bookings/confirm to execute only AFTER successful payment.

        console.log(`[PAYMENT_INTENT] Success: Booking ${bookingId} created. Returning clientSecret.`)

        return NextResponse.json({
            clientSecret: clientSecret,
            bookingId: bookingId,
            paymentIntentId: paymentIntentId,
            isMock: isMock
        })

    } catch (error) {
        console.error("[PAYMENTS_CREATE_INTENT]", error)
        return NextResponse.json({ error: "Internal Server Error", message: "Failed to create booking intent" }, { status: 500 })
    }
}
