import { PrismaClient, SubscriptionTier } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting payment test data seeding...")

  // Create test subscription for a user
  const testUser = await prisma.user.findFirst({
    where: { email: "visvajeet@gmail.com" },
  })

  if (!testUser) {
    console.log("❌ Test user not found. Please run db:seed first.")
    return
  }

  // Create test subscription
  const startDate = new Date()
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 1) // 1 month from now

  const subscription = await prisma.subscription.upsert({
    where: { id: "test-subscription-monthly" },
    update: {},
    create: {
      id: "test-subscription-monthly",
      userId: testUser.id,
      tier: SubscriptionTier.MONTHLY_PASS,
      siteId: "test-site-chennai-central",
      startDate,
      endDate,
      isActive: true,
    },
  })

  console.log(`✅ Created subscription: ${subscription.tier} for user ${testUser.email}`)

  // Create test payment record
  const testBooking = await prisma.booking.findFirst({
    where: { customerId: testUser.id },
  })

  if (testBooking) {
    const payment = await prisma.payment.upsert({
      where: { id: "test-payment-stripe" },
      update: {},
      create: {
        id: "test-payment-stripe",
        bookingId: testBooking.id,
        userId: testUser.id,
        amount: 100,
        currency: "USD",
        paymentMethod: "STRIPE_CARD",
        status: "COMPLETED",
        stripeId: "pi_test_1234567890",
        confirmedAt: new Date(),
      },
    })

    console.log(`✅ Created payment: ${payment.id} for booking ${testBooking.id}`)
  }

  // Create test Web3 payment
  const testBooking2 = await prisma.booking.findFirst({
    where: { customerId: testUser.id },
    skip: 1,
  })

  if (testBooking2) {
    const web3Payment = await prisma.payment.upsert({
      where: { id: "test-payment-web3" },
      update: {},
      create: {
        id: "test-payment-web3",
        bookingId: testBooking2.id,
        userId: testUser.id,
        amount: 50,
        currency: "USDC",
        paymentMethod: "POLYGON_USDC",
        status: "COMPLETED",
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        fromAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
        cryptoToken: "USDC",
        cryptoChain: "POLYGON_AMOY",
        confirmedAt: new Date(),
      },
    })

    console.log(`✅ Created Web3 payment: ${web3Payment.id} for booking ${testBooking2.id}`)
  }

  // Summary
  console.log("\n📊 Test Data Summary:")
  console.log(`- Test User: ${testUser.email}`)
  console.log(`- Subscription: ${subscription.tier}`)
  console.log(`- Test Payments: 2 (Stripe + Web3)`)
  console.log("\n🎉 Payment test data seeding completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })