import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { confirmBooking } from "@/lib/booking-engine"
import { logAuditEvent } from "@/lib/audit"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-01-28.clover",
})

/**
 * Create a Stripe Checkout session for a booking
 */
export async function createStripeCheckoutSession({
  bookingId,
  userId,
  amount,
  currency = "USD",
  customerEmail,
}: {
  bookingId: string
  userId: string
  amount: number
  currency?: string
  customerEmail?: string
}) {
  try {
    // Create or update payment record
    const existingPayment = await prisma.payment.findFirst({
      where: { bookingId }
    })

    const payment = existingPayment
      ? await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount,
            currency,
            status: "PENDING",
            userId,
          },
        })
      : await prisma.payment.create({
          data: {
            bookingId,
            userId,
            amount,
            currency,
            status: "PENDING",
            paymentMethod: "STRIPE_CARD",
          },
        })

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: "Parking Reservation",
              description: `Booking ID: ${bookingId}`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/customer/bookings/${bookingId}?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/customer/bookings/${bookingId}?payment=cancelled`,
      customer_email: customerEmail,
      metadata: {
        bookingId,
        paymentId: payment.id,
        userId,
      },
    })

    // Update payment with session ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripeCheckoutSessionId: session.id,
      },
    })

    return {
      sessionId: session.id,
      url: session.url,
      paymentId: payment.id,
    }
  } catch (error) {
    console.error("Stripe checkout session creation error:", error)
    throw new Error("Failed to create checkout session")
  }
}

/**
 * Create a Stripe Payment Intent for direct payment
 */
export async function createStripePaymentIntent({
  bookingId,
  userId,
  amount,
  currency = "USD",
}: {
  bookingId: string
  userId: string
  amount: number
  currency?: string
}) {
  try {
    // Create or update payment record
    const existingPayment = await prisma.payment.findFirst({
      where: { bookingId }
    })

    const payment = existingPayment
      ? await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount,
            currency,
            status: "PENDING",
            userId,
          },
        })
      : await prisma.payment.create({
          data: {
            bookingId,
            userId,
            amount,
            currency,
            status: "PENDING",
            paymentMethod: "STRIPE_CARD",
          },
        })

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        bookingId,
        paymentId: payment.id,
        userId,
      },
    })

    // Update payment with Payment Intent ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
      },
    })

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentId: payment.id,
    }
  } catch (error) {
    console.error("Stripe payment intent creation error:", error)
    throw new Error("Failed to create payment intent")
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(event: Stripe.Event) {
  console.log("🔔 Stripe webhook received:", event.type)

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutSessionCompleted(session)
      break
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      await handlePaymentIntentSucceeded(paymentIntent)
      break
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      await handlePaymentIntentFailed(paymentIntent)
      break
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge
      await handleChargeRefunded(charge)
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
}

/**
 * Handle checkout session completed
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId
  const paymentId = session.metadata?.paymentId
  const userId = session.metadata?.userId

  if (!bookingId || !paymentId) {
    console.error("Missing metadata in checkout session")
    return
  }

  try {
    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        confirmedAt: new Date(),
        stripeId: session.payment_intent as string,
      },
    })

    // Confirm booking
    await confirmBooking(bookingId)

    // Log audit event
    await logAuditEvent({
      userId: userId || "system",
      action: "PAYMENT_SUCCESS",
      resource: `Payment:${paymentId}`,
      ipAddress: "webhook",
      userAgent: "stripe-webhook",
      details: {
        bookingId,
        sessionId: session.id,
        amount: (session.amount_total || 0) / 100,
        currency: session.currency,
      },
    })

    console.log(`✅ Payment completed for booking ${bookingId}`)
  } catch (error) {
    console.error("Error handling checkout session completed:", error)
  }
}

/**
 * Handle payment intent succeeded
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata?.bookingId
  const paymentId = paymentIntent.metadata?.paymentId
  const userId = paymentIntent.metadata?.userId

  if (!bookingId || !paymentId) {
    console.error("Missing metadata in payment intent")
    return
  }

  try {
    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        confirmedAt: new Date(),
        stripeId: paymentIntent.id,
      },
    })

    // Confirm booking
    await confirmBooking(bookingId)

    // Log audit event
    await logAuditEvent({
      userId: userId || "system",
      action: "PAYMENT_SUCCESS",
      resource: `Payment:${paymentId}`,
      ipAddress: "webhook",
      userAgent: "stripe-webhook",
      details: {
        bookingId,
        paymentIntentId: paymentIntent.id,
        amount: (paymentIntent.amount || 0) / 100,
        currency: paymentIntent.currency,
      },
    })

    console.log(`✅ Payment succeeded for booking ${bookingId}`)
  } catch (error) {
    console.error("Error handling payment intent succeeded:", error)
  }
}

/**
 * Handle payment intent failed
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const paymentId = paymentIntent.metadata?.paymentId
  const userId = paymentIntent.metadata?.userId

  if (!paymentId) {
    console.error("Missing metadata in payment intent")
    return
  }

  try {
    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "FAILED",
      },
    })

    // Log audit event
    await logAuditEvent({
      userId: userId || "system",
      action: "PAYMENT_FAILED",
      resource: `Payment:${paymentId}`,
      ipAddress: "webhook",
      userAgent: "stripe-webhook",
      details: {
        paymentIntentId: paymentIntent.id,
        error: paymentIntent.last_payment_error?.message,
      },
    })

    console.log(`❌ Payment failed for payment ${paymentId}`)
  } catch (error) {
    console.error("Error handling payment intent failed:", error)
  }
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string

  try {
    // Find payment by payment intent ID
    const payment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    })

    if (!payment) {
      console.error("Payment not found for charge refund")
      return
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
      },
    })

    // Cancel booking if exists
    if (payment.bookingId) {
      const { cancelBooking } = await import("@/lib/booking-engine")
      await cancelBooking(payment.bookingId, payment.userId || "system")
    }

    // Log audit event
    await logAuditEvent({
      userId: payment.userId || "system",
      action: "PAYMENT_REFUNDED",
      resource: `Payment:${payment.id}`,
      ipAddress: "webhook",
      userAgent: "stripe-webhook",
      details: {
        chargeId: charge.id,
        amountRefunded: charge.amount_refunded / 100,
      },
    })

    console.log(`💰 Payment refunded for payment ${payment.id}`)
  } catch (error) {
    console.error("Error handling charge refunded:", error)
  }
}