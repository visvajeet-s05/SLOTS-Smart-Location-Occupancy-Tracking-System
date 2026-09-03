import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: {
                vehicle: {
                    include: {
                        fastag: true
                    }
                }
            }
        })

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        return NextResponse.json({
            userId: user.id,
            email: user.email,
            name: user.name,
            vehicleCount: user.vehicle.length,
            vehicles: user.vehicle
        })
    } catch (error) {
        console.error("[DEBUG_VEHICLES]", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { make, model, licensePlate, color } = body

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        })

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        // Create test vehicle
        const vehicle = await prisma.vehicle.create({
            data: {
                userId: user.id,
                make: make || "Toyota",
                model: model || "Fortuner",
                licensePlate: licensePlate || "TEST-001",
                color: color || "White",
                isActive: true
            }
        })

        return NextResponse.json({
            success: true,
            vehicle: vehicle
        })
    } catch (error) {
        console.error("[DEBUG_VEHICLES_POST]", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}