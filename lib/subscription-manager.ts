import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import Stripe from 'stripe'

const prisma = new PrismaClient()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover'
})

export interface SubscriptionPlan {
  id: string
  name: string
  stripePriceId: string
  features: string[]
  limits: {
    parkingLots?: number
    bookings?: number
    staff?: number
  }
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  MONTHLY_RESERVED: {
    id: 'MONTHLY_RESERVED',
    name: 'Monthly Reserved',
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_RESERVED!,
    features: ['Priority booking', 'Monthly billing', 'Basic support'],
    limits: { parkingLots: 1, bookings: 100 }
  },
  CORPORATE: {
    id: 'CORPORATE',
    name: 'Corporate',
    stripePriceId: process.env.STRIPE_PRICE_CORPORATE!,
    features: ['Multiple locations', 'Advanced analytics', 'Priority support', 'API access'],
    limits: { parkingLots: 10, bookings: 1000, staff: 20 }
  },
  OWNER_FLEET: {
    id: 'OWNER_FLEET',
    name: 'Owner Fleet',
    stripePriceId: process.env.STRIPE_PRICE_OWNER_FLEET!,
    features: ['Unlimited locations', 'Fleet management', 'Advanced analytics', 'Dedicated support'],
    limits: { parkingLots: -1, bookings: -1, staff: -1 } // Unlimited
  }
}

export class SubscriptionManager {
  /**
   * Create a Stripe subscription for a user
   */
  async createSubscription(userId: string, planId: string): Promise<string> {
    const plan = SUBSCRIPTION_PLANS[planId]
    if (!plan) {
      throw new Error(`Invalid subscription plan: ${planId}`)
    }

    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        isActive: true,
        endDate: {
          gt: new Date()
        }
      }
    })

    if (existingSubscription) {
      throw new Error('User already has an active subscription')
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Create Stripe customer if not exists
    let customerId = await this.getStripeCustomerId(userId)
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: { userId }
      })
      customerId = customer.id
    }

    // Create subscription in Stripe
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      metadata: { userId, planId }
    })
    const subscriptionAny = subscription as any

    // Save subscription in database
    await prisma.subscription.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        stripeSubscriptionId: subscription.id,
        tier: "MONTHLY_PASS" as any,
        startDate: new Date(subscriptionAny.current_period_start * 1000),
        endDate: new Date(subscriptionAny.current_period_end * 1000),
        isActive: true,
        updatedAt: new Date()
      }
    })

    return subscription.id
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(userId: string, cancelAtPeriodEnd: boolean = true): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        isActive: true,
        endDate: {
          gt: new Date()
        }
      }
    })

    if (!subscription) {
      throw new Error('No active subscription found')
    }

    if (cancelAtPeriodEnd) {
      // Cancel at period end
      if (subscription.stripeSubscriptionId) {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true
        })
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { isActive: false }
      })
    } else {
      // Cancel immediately
      if (subscription.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId)
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          isActive: false,
        }
      })
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionChange(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeletion(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await this.handlePaymentSuccess(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.Invoice)
        break
    }
  }

  private async handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
    const dbSubscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id }
    })

    if (dbSubscription) {
      const subscriptionAny = subscription as any
      await prisma.subscription.update({
        where: { id: dbSubscription.id },
        data: {
          isActive: subscription.status === 'active',
          startDate: new Date(subscriptionAny.current_period_start * 1000),
          endDate: new Date(subscriptionAny.current_period_end * 1000),
          updatedAt: new Date()
        }
      })
    }
  }

  private async handleSubscriptionDeletion(subscription: Stripe.Subscription): Promise<void> {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    })
  }

  private async handlePaymentSuccess(invoice: Stripe.Invoice): Promise<void> {
    // Handle successful payment - could trigger notifications, etc.
    console.log(`Payment succeeded for invoice ${invoice.id}`)
  }

  private async handlePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
    // Handle failed payment - could suspend features, send notifications
    console.log(`Payment failed for invoice ${invoice.id}`)
  }

  /**
   * Get user's active subscription
   */
  async getUserSubscription(userId: string): Promise<any | null> {
    return await prisma.subscription.findFirst({
      where: {
        userId,
        isActive: true,
        endDate: {
          gt: new Date()
        }
      }
    })
  }

  /**
   * Check if user has access to a feature based on their subscription
   */
  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId)

    if (!subscription) {
      // Free tier - limited access
      return ['basic_booking', 'basic_support'].includes(feature)
    }

    const plan = SUBSCRIPTION_PLANS[subscription.plan]

    switch (feature) {
      case 'multiple_locations':
        return plan.limits.parkingLots === -1 || plan.limits.parkingLots! > 1

      case 'advanced_analytics':
        return ['CORPORATE', 'OWNER_FLEET'].includes(subscription.plan)

      case 'api_access':
        return subscription.plan === 'CORPORATE'

      case 'unlimited_bookings':
        return plan.limits.bookings === -1

      default:
        return true
    }
  }

  /**
   * Get Stripe customer ID for user
   */
  private async getStripeCustomerId(userId: string): Promise<string | null> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      select: { stripeSubscriptionId: true }
    })

    if (subscription && subscription.stripeSubscriptionId) {
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId)
      return stripeSub.customer as string
    }

    return null
  }

  /**
   * Get subscription plan details
   */
  getPlanDetails(planId: string): SubscriptionPlan | null {
    return SUBSCRIPTION_PLANS[planId] || null
  }

  /**
   * Get all available plans
   */
  getAllPlans(): SubscriptionPlan[] {
    return Object.values(SUBSCRIPTION_PLANS)
  }
}

// Singleton instance
export const subscriptionManager = new SubscriptionManager()
