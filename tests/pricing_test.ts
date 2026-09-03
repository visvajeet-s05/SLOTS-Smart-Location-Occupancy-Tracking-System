import { PrismaClient, BayType } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting pricing test data seeding...")

  // Create test pricing rule for Chennai Central
  const pricingRule = await prisma.dynamicPricingRule.upsert({
    where: { id: "test-site-chennai-central-pricing" },
    update: {},
    create: {
      id: "test-site-chennai-central-pricing",
      siteId: "test-site-chennai-central",
      baseRatePerHour: 50,
      minRate: 25,
      maxRate: 100,
      occupancyMultiplier: 1.0,
      peakMultiplier: 1.3,
      eventMultiplier: 1.5,
      isDynamicEnabled: true,
    },
  })

  console.log(`✅ Created pricing rule for Chennai Central`)
  console.log(`   - Base Rate: ₹${pricingRule.baseRatePerHour}/hr`)
  console.log(`   - Min Rate: ₹${pricingRule.minRate}/hr`)
  console.log(`   - Max Rate: ₹${pricingRule.maxRate}/hr`)
  console.log(`   - Dynamic Pricing: ${pricingRule.isDynamicEnabled ? 'Enabled' : 'Disabled'}`)

  // Create test demand snapshots
  const now = new Date()
  
  // Low demand snapshot
  await prisma.demandSnapshot.create({
    data: {
      siteId: "test-site-chennai-central",
      occupancyRate: 0.2,
      calculatedRate: 30,
      demandScore: 0.25,
      weatherCondition: "sunny",
      isPeakHour: false,
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      pricingRuleId: pricingRule.id,
    },
  })

  // High demand snapshot
  await prisma.demandSnapshot.create({
    data: {
      siteId: "test-site-chennai-central",
      occupancyRate: 0.85,
      calculatedRate: 75,
      demandScore: 0.85,
      weatherCondition: "rainy",
      isPeakHour: true,
      timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
      pricingRuleId: pricingRule.id,
    },
  })

  // Critical demand snapshot
  await prisma.demandSnapshot.create({
    data: {
      siteId: "test-site-chennai-central",
      occupancyRate: 0.95,
      calculatedRate: 95,
      demandScore: 0.95,
      weatherCondition: "storm",
      isPeakHour: true,
      timestamp: now,
      pricingRuleId: pricingRule.id,
    },
  })

  console.log(`✅ Created 3 demand snapshots (Low, High, Critical)`)

  // Summary
  console.log("\n📊 Test Data Summary:")
  console.log(`- Pricing Rule: Dynamic pricing enabled with ₹50 base rate`)
  console.log(`- Demand Snapshots: 3 (Low 20%, High 85%, Critical 95%)`)
  console.log("\n🎉 Pricing test data seeding completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })