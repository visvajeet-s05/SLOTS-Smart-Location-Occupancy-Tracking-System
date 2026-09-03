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
        console.log("🔍 Fetching profile for:", session.user.email)
        
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: {
                vehicle: {
                    include: {
                        fastag: true // Include Fastag details
                    }
                },
                fastags: true
            }
        })

        if (!user) {
            console.log("❌ User not found")
            return new NextResponse("User not found", { status: 404 })
        }

        console.log("✅ User found with", user.vehicle.length, "vehicles")

        // Return all vehicles, not just the first one
        const vehicles = user.vehicle.map(v => ({
            id: v.id,
            model: `${v.make} ${v.model}`,
            plate: v.licensePlate,
            type: "Car",
            isDefault: v.isActive,
            fastagId: v.fastag?.tagId || null
        }))

        console.log("🚗 Processed vehicles:", vehicles)

        // Get first vehicle's fastag for backward compatibility
        const firstVehicle = vehicles[0] || null
        const fastag = firstVehicle?.fastagId || user.fastags[0]?.tagId || null

        const response = {
            name: user.name,
            email: user.email,
            phone: user.phone,
            vehicles: vehicles,
            vehicle: firstVehicle, // For backward compatibility
            fastagId: fastag,
            userId: user.id
        }

        console.log("📤 Returning response:", response)
        return NextResponse.json(response)
    } catch (error) {
        console.error("[USER_PROFILE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const body = await request.json()
        const { name, phone } = body

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        })

        if (!user) {
            return new NextResponse("User not found", { status: 404 })
        }

        const updatedUser = await prisma.user.update({
            where: { email: session.user.email },
            data: {
                ...(name && { name }),
                ...(phone && { phone })
            }
        })

        return NextResponse.json({
            name: updatedUser.name,
            email: updatedUser.email,
            phone: updatedUser.phone
        })
    } catch (error) {
        console.error("[USER_PROFILE_PATCH]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
