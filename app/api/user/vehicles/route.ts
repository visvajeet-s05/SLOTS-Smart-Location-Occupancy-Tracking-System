import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        return new NextResponse("Unauthorized", { status: 401 })
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
            return new NextResponse("User not found", { status: 404 })
        }

        const vehicles = user.vehicle.map(v => ({
            id: v.id,
            model: `${v.make} ${v.model}`,
            plate: v.licensePlate,
            type: "Car",
            isDefault: v.isActive,
            fastagId: v.fastag?.tagId || null
        }))

        return NextResponse.json({ vehicles })
    } catch (error) {
        console.error("[USER_VEHICLES_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const body = await request.json()
        const { make, model, licensePlate, color, fastagId } = body

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        })

        if (!user) {
            return new NextResponse("User not found", { status: 404 })
        }

        // Check if vehicle with this plate already exists for this user
        const existingVehicle = await prisma.vehicle.findFirst({
            where: {
                userId: user.id,
                licensePlate: licensePlate
            }
        })

        if (existingVehicle) {
            return new NextResponse("Vehicle with this license plate already exists", { status: 400 })
        }

        // Create vehicle
        const vehicle = await prisma.vehicle.create({
            data: {
                userId: user.id,
                make: make || "Unknown",
                model: model || "Unknown",
                licensePlate: licensePlate,
                color: color || "Unknown",
                isActive: true
            }
        })

        // If fastagId provided, create or link FASTag
        if (fastagId) {
            await prisma.fastag.upsert({
                where: { tagId: fastagId },
                update: {
                    vehicleId: vehicle.id,
                    userId: user.id
                },
                create: {
                    tagId: fastagId,
                    vehicleId: vehicle.id,
                    userId: user.id,
                    balance: 0.0
                }
            })
        }

        return NextResponse.json({
            id: vehicle.id,
            model: `${vehicle.make} ${vehicle.model}`,
            plate: vehicle.licensePlate,
            type: "Car",
            isDefault: vehicle.isActive,
            fastagId: fastagId || null
        })
    } catch (error) {
        console.error("[USER_VEHICLES_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const body = await request.json()
        const { vehicleId } = body

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: {
                vehicle: true
            }
        })

        if (!user) {
            return new NextResponse("User not found", { status: 404 })
        }

        // Check if vehicle belongs to user
        const vehicle = await prisma.vehicle.findFirst({
            where: {
                id: vehicleId,
                userId: user.id
            }
        })

        if (!vehicle) {
            return new NextResponse("Vehicle not found", { status: 404 })
        }

        // Don't allow deletion if it's the only vehicle
        if (user.vehicle.length <= 1) {
            return new NextResponse("Cannot delete the only vehicle", { status: 400 })
        }

        await prisma.vehicle.delete({
            where: { id: vehicleId }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[USER_VEHICLES_DELETE]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}