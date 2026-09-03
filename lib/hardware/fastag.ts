import { PrismaClient, PaymentMethod, payment_status } from "@prisma/client"
import { triggerBarrierOpen } from "./gate-controller"
import { logAuditEvent } from "@/lib/audit"
import crypto from "crypto"

const prisma = new PrismaClient()

export interface FASTagScanRequest {
  siteId: string
  tagId: string
  readerId: string
  timestamp?: Date
}

export interface FASTagScanResponse {
  success: boolean
  actuateGate: boolean
  vehicleNumber?: string
  balanceRemaining?: number
  amountDebited?: number
  message: string
  transactionId?: string
}

const ENTRY_FEE = 50 // INR - Standard entry fee
const HOURLY_RATE = 20 // INR - Hourly parking rate

/**
 * Process FASTag scan
 * Identifies account, validates balance, debits on exit, triggers gate
 */
export async function processFASTagScan(
  request: FASTagScanRequest
): Promise<FASTagScanResponse> {
  const { siteId, tagId, readerId, timestamp = new Date() } = request

  try {
    // 1. Identify FASTag account via tagId
    const fastagAccount = await prisma.fASTagAccount.findUnique({
      where: { tagId },
      include: { user: true },
    })

    if (!fastagAccount) {
      return {
        success: false,
        actuateGate: false,
        message: "FASTag not registered",
      }
    }

    if (!fastagAccount.isActive) {
      return {
        success: false,
        actuateGate: false,
        message: "FASTag account is inactive",
      }
    }

    // 2. Check if vehicle has an active booking
    const activeBooking = await prisma.booking.findFirst({
      where: {
        vehicleNumber: fastagAccount.vehicleNumber,
        status: "CONFIRMED",
        OR: [
          { startTime: { lte: new Date() } },
          { endTime: { gte: new Date() } },
        ],
      },
    })

    let isEntry = !activeBooking
    let amountToDebit = 0

    if (isEntry) {
      // Entry: Check if sufficient balance for entry fee
      if (fastagAccount.walletBalance < ENTRY_FEE) {
        return {
          success: false,
          actuateGate: false,
          vehicleNumber: fastagAccount.vehicleNumber,
          balanceRemaining: fastagAccount.walletBalance,
          message: "Insufficient balance for entry",
        }
      }
      amountToDebit = ENTRY_FEE
    } else {
      // Exit: Calculate parking duration and fee
      const booking = activeBooking!
      const startTime = new Date(booking.startTime)
      const endTime = new Date()
      const durationHours = Math.ceil(
        (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
      )
      
      amountToDebit = ENTRY_FEE + (durationHours * HOURLY_RATE)

      if (fastagAccount.walletBalance < amountToDebit) {
        return {
          success: false,
          actuateGate: false,
          vehicleNumber: fastagAccount.vehicleNumber,
          balanceRemaining: fastagAccount.walletBalance,
          message: "Insufficient balance for exit",
        }
      }
    }

    // 3. Debit wallet balance
    const transactionId = crypto.randomUUID()
    await prisma.fASTagAccount.update({
      where: { id: fastagAccount.id },
      data: {
        walletBalance: {
          decrement: amountToDebit,
        },
      },
    })

    // 4. Create payment record
    const payment = await prisma.payment.create({
      data: {
        id: crypto.randomUUID(),
        userId: fastagAccount.userId,
        bookingId: activeBooking?.id,
        amount: amountToDebit,
        currency: "INR",
        status: payment_status.COMPLETED,
        paymentMethod: PaymentMethod.CASH_VALET,
        txHash: transactionId,
        fromAddress: tagId,
        region: "in",
        updatedAt: new Date(),
      },
    })

    // 5. If entry, create a booking record
    if (isEntry) {
      // Find an available bay
      const availableBay = await prisma.parkingBay.findFirst({
        where: {
          zone: {
            floor: {
              siteId,
            },
          },
          status: "AVAILABLE",
        },
      })

      if (availableBay) {
        // Simplified: Just mark bay as occupied without creating booking
        // In production, this would create a proper booking
        await prisma.parkingBay.update({
          where: { id: availableBay.id },
          data: {
            status: "OCCUPIED",
            currentPlate: fastagAccount.vehicleNumber,
          },
        })
      }
    } else {
      // Exit: Just release the bay
      if (activeBooking && activeBooking.parkingBayId) {
        await prisma.parkingBay.update({
          where: { id: activeBooking.parkingBayId },
          data: {
            status: "AVAILABLE",
            currentPlate: null,
          },
        })
      }
    }

    // 6. Trigger barrier open
    const gateResult = await triggerBarrierOpen({
      siteId,
      gateId: readerId, // Using readerId as gateId for simplicity
      triggerReason: "FASTAG",
      vehicleNumber: fastagAccount.vehicleNumber,
      userId: fastagAccount.userId,
    })

    // 7. Log audit event
    await logAuditEvent({
      userId: fastagAccount.userId,
      action: isEntry ? "FASTAG_ENTRY" : "FASTAG_EXIT",
      resource: `FASTag:${tagId}`,
      ipAddress: "hardware",
      userAgent: "fastag-reader",
      details: {
        vehicleNumber: fastagAccount.vehicleNumber,
        amountDebited: amountToDebit,
        balanceRemaining: fastagAccount.walletBalance - amountToDebit,
        transactionId,
        siteId,
        readerId,
      },
    })

    // 8. Send real-time notification
    // In production, this would send via WebSocket or push notification
    console.log(`[FASTAG] Notification sent to user ${fastagAccount.userId}: ${isEntry ? 'Entry' : 'Exit'} successful`)

    return {
      success: true,
      actuateGate: gateResult.success,
      vehicleNumber: fastagAccount.vehicleNumber,
      balanceRemaining: fastagAccount.walletBalance - amountToDebit,
      amountDebited: amountToDebit,
      message: isEntry ? "Entry successful" : "Exit successful",
      transactionId,
    }
  } catch (error: any) {
    console.error("Error processing FASTag scan:", error)
    return {
      success: false,
      actuateGate: false,
      message: error.message || "Failed to process FASTag scan",
    }
  }
}

/**
 * Get FASTag account balance
 */
export async function getFASTagBalance(tagId: string): Promise<{
  balance: number
  vehicleNumber?: string
  isActive: boolean
} | null> {
  try {
    const account = await prisma.fASTagAccount.findUnique({
      where: { tagId },
    })

    if (!account) {
      return null
    }

    return {
      balance: account.walletBalance,
      vehicleNumber: account.vehicleNumber,
      isActive: account.isActive,
    }
  } catch (error) {
    console.error("Error getting FASTag balance:", error)
    return null
  }
}

/**
 * Recharge FASTag wallet
 */
export async function rechargeFASTagWallet(
  tagId: string,
  amount: number,
  userId: string
): Promise<{
  success: boolean
  newBalance?: number
  message: string
}> {
  try {
    const account = await prisma.fASTagAccount.findUnique({
      where: { tagId },
    })

    if (!account) {
      return {
        success: false,
        message: "FASTag not found",
      }
    }

    if (account.userId !== userId) {
      return {
        success: false,
        message: "Unauthorized",
      }
    }

    await prisma.fASTagAccount.update({
      where: { id: account.id },
      data: {
        walletBalance: {
          increment: amount,
        },
      },
    })

    // Log audit event
    await logAuditEvent({
      userId,
      action: "FASTAG_RECHARGE",
      resource: `FASTag:${tagId}`,
      ipAddress: "web",
      userAgent: "fastag-recharge",
      details: {
        amount,
        newBalance: account.walletBalance + amount,
      },
    })

    return {
      success: true,
      newBalance: account.walletBalance + amount,
      message: "Recharge successful",
    }
  } catch (error: any) {
    console.error("Error recharging FASTag:", error)
    return {
      success: false,
      message: error.message || "Failed to recharge FASTag",
    }
  }
}