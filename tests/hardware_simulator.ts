import { PrismaClient, DeviceType } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting hardware test data seeding...")

  // Get test site
  const site = await prisma.parkingSite.findFirst({
    where: { name: "Chennai Central" },
  })

  if (!site) {
    console.error("❌ Test site not found. Please run booking test first.")
    process.exit(1)
  }

  // Create barrier gates
  const gate1 = await prisma.hardwareDevice.upsert({
    where: { id: "test-gate-1" },
    update: {},
    create: {
      id: "test-gate-1",
      siteId: site.id,
      name: "Entry Gate 1",
      deviceType: DeviceType.BARRIER_GATE,
      ipAddress: "192.168.1.100",
      macAddress: "00:11:22:33:44:55",
      status: "ONLINE",
    },
  })

  const gate2 = await prisma.hardwareDevice.upsert({
    where: { id: "test-gate-2" },
    update: {},
    create: {
      id: "test-gate-2",
      siteId: site.id,
      name: "Exit Gate 1",
      deviceType: DeviceType.BARRIER_GATE,
      ipAddress: "192.168.1.101",
      macAddress: "00:11:22:33:44:56",
      status: "ONLINE",
    },
  })

  console.log(`✅ Created 2 barrier gates`)

  // Create FASTag reader
  const fastagReader = await prisma.hardwareDevice.upsert({
    where: { id: "test-fastag-reader" },
    update: {},
    create: {
      id: "test-fastag-reader",
      siteId: site.id,
      name: "FASTag Reader 1",
      deviceType: DeviceType.FASTAG_READER,
      ipAddress: "192.168.1.102",
      macAddress: "00:11:22:33:44:57",
      status: "ONLINE",
    },
  })

  console.log(`✅ Created FASTag reader`)

  // Create EV chargers
  const evCharger1 = await prisma.hardwareDevice.upsert({
    where: { id: "test-ev-charger-1" },
    update: {},
    create: {
      id: "test-ev-charger-1",
      siteId: site.id,
      name: "EV Charger 1",
      deviceType: DeviceType.EV_CHARGER,
      ipAddress: "192.168.1.103",
      macAddress: "00:11:22:33:44:58",
      status: "ONLINE",
    },
  })

  const evCharger2 = await prisma.hardwareDevice.upsert({
    where: { id: "test-ev-charger-2" },
    update: {},
    create: {
      id: "test-ev-charger-2",
      siteId: site.id,
      name: "EV Charger 2",
      deviceType: DeviceType.EV_CHARGER,
      ipAddress: "192.168.1.104",
      macAddress: "00:11:22:33:44:59",
      status: "ONLINE",
    },
  })

  console.log(`✅ Created 2 EV chargers`)

  // Get customer user
  const customer = await prisma.user.findFirst({
    where: { role: "CUSTOMER" },
  })

  if (!customer) {
    console.error("❌ Customer user not found. Please run booking test first.")
    process.exit(1)
  }

  // Create FASTag account
  const fastagAccount = await prisma.fASTagAccount.upsert({
    where: { tagId: "3412759081" },
    update: {},
    create: {
      id: "test-fastag-account",
      userId: customer.id,
      tagId: "3412759081",
      vehicleNumber: "TN01AB1234",
      walletBalance: 1500.0,
      isActive: true,
    },
  })

  console.log(`✅ Created FASTag account`)
  console.log(`   - Tag ID: ${fastagAccount.tagId}`)
  console.log(`   - Vehicle: ${fastagAccount.vehicleNumber}`)
  console.log(`   - Balance: ₹${fastagAccount.walletBalance}`)

  // Get an EV charging bay
  const evBay = await prisma.parkingBay.findFirst({
    where: {
      bayType: "EV_CHARGING",
    },
  })

  if (!evBay) {
    console.log(`⚠️  No EV charging bay found. Creating one...`)
    
    // Get a zone
    const zone = await prisma.zone.findFirst({
      where: {
        floor: {
          siteId: site.id,
        },
      },
    })

    if (zone) {
      const newEvBay = await prisma.parkingBay.create({
        data: {
          zoneId: zone.id,
          bayNumber: "EV-01",
          vehicleType: "CAR",
          status: "AVAILABLE",
          bayType: "EV_CHARGING",
          isAccessible: false,
          isReserved: false,
        },
      })
      console.log(`✅ Created EV charging bay: ${newEvBay.bayNumber}`)
    }
  }

  // Summary
  console.log("\n📊 Hardware Test Data Summary:")
  console.log(`- Barrier Gates: 2 (Entry/Exit)`)
  console.log(`- FASTag Reader: 1`)
  console.log(`- EV Chargers: 2`)
  console.log(`- FASTag Account: Tag ID 3412759081, Balance ₹1,500`)
  console.log("\n🎉 Hardware test data seeding completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })