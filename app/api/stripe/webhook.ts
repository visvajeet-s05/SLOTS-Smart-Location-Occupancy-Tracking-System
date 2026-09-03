import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature');
  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.log(`Webhook signature verification failed. ${err}`);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSucceeded(paymentIntent);
      break;
    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailed(failedIntent);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { id, amount, currency, metadata } = paymentIntent;

  await prisma.payment.upsert({
    where: { stripePaymentIntentId: id },
    update: {
      status: 'COMPLETED',
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      stripePaymentIntentId: id,
      amount,
      currency,
      bookingId: metadata.bookingId,
      status: 'COMPLETED',
      region: metadata.region || 'us',
      updatedAt: new Date(),
    },
  });

  console.log(`Payment ${id} succeeded for booking ${metadata.bookingId}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { id, metadata } = paymentIntent;

  await prisma.payment.upsert({
    where: { stripePaymentIntentId: id },
    update: {
      status: 'FAILED',
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      stripePaymentIntentId: id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      bookingId: metadata.bookingId,
      status: 'FAILED',
      region: metadata.region || 'us',
      updatedAt: new Date(),
    },
  });

  console.log(`Payment ${id} failed for booking ${metadata.bookingId}`);
}
