import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const { paymentIntentId } = await request.json();

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      await prisma.payment.upsert({
        where: { stripePaymentIntentId: paymentIntentId },
        update: {
          status: 'COMPLETED',
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          stripePaymentIntentId: paymentIntentId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          bookingId: paymentIntent.metadata?.bookingId,
          status: 'COMPLETED',
          region: paymentIntent.metadata?.region || 'us',
          updatedAt: new Date(),
        },
      });

      // Emit payment confirmed event
      await emitPaymentConfirmedEvent(paymentIntent);

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Payment not yet succeeded' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error confirming payment:', error);
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
  }
}

async function emitPaymentConfirmedEvent(paymentIntent: any) {
  // This would integrate with your event system (Kafka/PubSub)
  console.log('Payment confirmed event emitted:', {
    type: 'PAYMENT_CONFIRMED',
    paymentId: paymentIntent.id,
    bookingId: paymentIntent.metadata.bookingId,
    region: paymentIntent.metadata.region,
  });
}
