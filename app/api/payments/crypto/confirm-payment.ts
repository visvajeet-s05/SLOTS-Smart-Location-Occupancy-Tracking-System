import { NextRequest, NextResponse } from 'next/server';
import { verifyCryptoPayment } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;
const SLOTIFY_WALLET = process.env.SLOTIFY_WALLET;

const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon

export async function confirmPayment(request: NextRequest) {
  const { paymentId, txHash } = await request.json();
  if (!SLOTIFY_WALLET) {
    return NextResponse.json({ error: 'SLOTIFY_WALLET is not configured' }, { status: 500 });
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    try {
      const { transaction, receipt, amount } = await verifyCryptoPayment(
        txHash,
        payment.amount,
        SLOTIFY_WALLET
      );

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          txHash,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      // Emit payment confirmed event
      await emitPaymentConfirmedEvent({ id: paymentId }, txHash);

      return NextResponse.json({ success: true });
    } catch (error: any) {
      return NextResponse.json({ error: error?.message ?? 'Payment verification failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error confirming crypto payment:', error);
    return NextResponse.json({ error: 'Failed to confirm crypto payment' }, { status: 500 });
  }
}

async function emitPaymentConfirmedEvent(payment: any, txHash: string) {
  // This would integrate with your event system (Kafka/PubSub)
  console.log('Crypto payment confirmed event emitted:', {
    type: 'CRYPTO_PAYMENT_CONFIRMED',
    paymentId: payment.id,
    txHash,
  });
}
