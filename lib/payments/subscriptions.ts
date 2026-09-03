import { PrismaClient, SubscriptionTier } from "@prisma/client"
import { z } from "zod"

const prisma = new PrismaClient()

// Validation schemas
const subscriptionSchema = z.object({
  userId: z.string(),
  tier: z.nativeEnum(SubscriptionTier),
  siteId: z.string().optional(),
  durationMonths: z.number().min(1).max(36),
})

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  MONTHLY_PASS: {
    name: "Monthly Pass",
    durationMonths: 1,
    price: 500, // INR
    features: [
      "Unlimited parking at selected site",
      "Priority slot allocation",
      "24/7 access",
    ],
  },
  ANNUAL_PASS: {
    name: "Annual Pass",
    durationMonths: 12,
    price: 5000, // INR (save 17%)
    features: [
      "Unlimited parking at selected site",
      "Priority slot allocation",
      "24/7 access",
      "Valet service included",
      "Exclusive VIP parking access",
    ],
  },
  VIP_UNLIMITED: {
    name: "VIP Unlimited",
    durationMonths: 12,
    price: 15000, // INR
    features: [
      "Unlimited parking at all sites",
      "Premium slot allocation",
      "24/7 access",
      "Valet service included",
      "Exclusive VIP parking access",
      "Concierge support",
      "EV charging included",
    ],
  },
}

/**
 * Check if user has an active subscription
 */
export async function checkUserActiveSubscription(
  userId: string,
  siteId?: string
): Promise<boolean> {
  const now = new Date()

  const where: any = {
    userId,
    isActive: true,
    endDate: {
      gt: now,
    },
  }

  if (siteId) {
    where.OR = [
      { siteId },
      { siteId: null }, // Global pass
    ]
  }

  const subscription = await prisma.subscription.findFirst({
    where,
  })

  return !!subscription
}

/**
 * Get user's active subscription details
 */
export async function getUserSubscription(userId: string) {
  const now = new Date()

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      isActive: true,
      endDate: {
        gt: now,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  return subscription
}

/**
 * Create a new subscription pass
 */
export async function createSubscriptionPass({
  userId,
  tier,
  siteId,
  durationMonths,
}: {
  userId: string
  tier: SubscriptionTier
  siteId?: string
  durationMonths: number
}) {
  // Validate input
  const validated = subscriptionSchema.parse({
    userId,
    tier,
    siteId,
    durationMonths,
  })

  // Calculate end date
  const startDate = new Date()
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + durationMonths)

  // Create subscription
  const subscription = await prisma.subscription.create({
    data: {
      userId: validated.userId,
      tier: validated.tier,
      siteId: validated.siteId,
      startDate,
      endDate,
      isActive: true,
    },
  })

  return subscription
}

/**
 * Create subscription via Stripe
 */
export async function createStripeSubscription({
  userId,
  tier,
  siteId,
  customerEmail,
}: {
  userId: string
  tier: SubscriptionTier
  siteId?: string
  customerEmail?: string
}) {
  const Stripe = require("stripe")
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-01-28.clover",
  })

  const plan = SUBSCRIPTION_PLANS[tier as keyof typeof SUBSCRIPTION_PLANS]
  if (!plan) {
    throw new Error("Invalid subscription tier")
  }

  // Calculate end date
  const startDate = new Date()
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + plan.durationMonths)

  // Create Stripe product and price
  const product = await stripe.products.create({
    name: plan.name,
    description: `SLOTS ${plan.name} - ${plan.durationMonths} months`,
  })

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(plan.price * 100), // Convert to cents
    currency: "inr",
    recurring: {
      interval: "month",
      interval_count: plan.durationMonths,
    },
  })

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price: price.id,
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/customer/subscriptions?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/customer/subscriptions?cancelled=true`,
    customer_email: customerEmail,
    metadata: {
      userId,
      tier,
      siteId: siteId || "global",
      durationMonths: plan.durationMonths.toString(),
    },
  })

  return {
    sessionId: session.id,
    url: session.url,
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      isActive: false,
    },
  })

  return subscription
}

/**
 * Renew subscription
 */
export async function renewSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    throw new Error("Subscription not found")
  }

  const plan = SUBSCRIPTION_PLANS[subscription.tier as keyof typeof SUBSCRIPTION_PLANS]
  if (!plan) {
    throw new Error("Invalid subscription tier")
  }

  const newEndDate = new Date(subscription.endDate)
  newEndDate.setMonth(newEndDate.getMonth() + plan.durationMonths)

  const updatedSubscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      endDate: newEndDate,
      isActive: true,
    },
  })

  return updatedSubscription
}

/**
 * Get available subscription plans
 */
export function getSubscriptionPlans() {
  return SUBSCRIPTION_PLANS
}

/**
 * Validate subscription eligibility for booking
 */
export async function validateSubscriptionForBooking(
  userId: string,
  siteId: string
): Promise<{ eligible: boolean; subscription?: any }> {
  const subscription = await getUserSubscription(userId)

  if (!subscription) {
    return { eligible: false }
  }

  // Check if subscription is active
  if (!subscription.isActive || new Date(subscription.endDate) < new Date()) {
    return { eligible: false }
  }

  // Check if subscription covers the site
  if (subscription.siteId && subscription.siteId !== siteId) {
    return { eligible: false }
  }

  // Check tier eligibility
  if (subscription.tier === SubscriptionTier.NONE) {
    return { eligible: false }
  }

  return { eligible: true, subscription }
}