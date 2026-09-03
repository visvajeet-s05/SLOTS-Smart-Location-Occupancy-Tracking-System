"use server"

import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth-options"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

export async function getUserProfile() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
            vehicle: true,
            _count: {
                select: { booking_booking_customerIdTouser: true }
            }
        }
    })

    // Basic stats
    const stats = await prisma.booking.groupBy({
        by: ['status'],
        where: { customerId: session.user.id },
        _count: true
    })

    return { user, stats }
}

export async function updateUserProfile(data: any) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) throw new Error("Unauthorized")

    // Update User Basic Info
    await prisma.user.update({
        where: { id: session.user.id },
        data: {
            name: data.name,
            phone: data.phone,
            preferredCurrency: data.preferredCurrency || "INR",
            // walletBalance is usually updated via payment gateway websockets/webhooks, not direct profile edit
        }
    })

    // Update or Create Vehicle (Simplified: 1st vehicle for now or generic update)
    // In real app we might manage multiple vehicles.
    if (data.licensePlate) {
        const existingVehicle = await prisma.vehicle.findFirst({
            where: { userId: session.user.id }
        })

        if (existingVehicle) {
            await prisma.vehicle.update({
                where: { id: existingVehicle.id },
                data: {
                    licensePlate: data.licensePlate,
                    model: data.vehicleModel,
                }
            })
        } else {
            await prisma.vehicle.create({
                data: {
                    id: globalThis.crypto.randomUUID(),
                    userId: session.user.id,
                    licensePlate: data.licensePlate,
                    model: data.vehicleModel,
                    make: "Unknown", // Default
                    color: "Unknown",
                    updatedAt: new Date()
                }
            })
        }
    }

    revalidatePath('/dashboard/profile')
    return { success: true }
}
