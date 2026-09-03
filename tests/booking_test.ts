import { PrismaClient, BayType, BayStatus, VehicleType } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting booking test data seeding...")

  // Create a test parking site
  const site = await prisma.parkingSite.upsert({
    where: { id: "test-site-chennai-central" },
    update: {},
    create: {
      id: "test-site-chennai-central",
      name: "Test Chennai Central",
      location: "Chennai Central",
      latitude: 13.0827,
      longitude: 80.2707,
    },
  })

  console.log(`✅ Site created: ${site.name}`)

  // Create test floors
  const floor1 = await prisma.floor.upsert({
    where: { id: "test-floor-1" },
    update: {},
    create: {
      id: "test-floor-1",
      siteId: site.id,
      levelName: "Ground Floor",
      levelNumber: 0,
    },
  })

  const floor2 = await prisma.floor.upsert({
    where: { id: "test-floor-2" },
    update: {},
    create: {
      id: "test-floor-2",
      siteId: site.id,
      levelName: "First Floor",
      levelNumber: 1,
    },
  })

  console.log(`✅ Floors created: ${floor1.levelName}, ${floor2.levelName}`)

  // Create test zones
  const zone1 = await prisma.zone.upsert({
    where: { id: "test-zone-a" },
    update: {},
    create: {
      id: "test-zone-a",
      floorId: floor1.id,
      zoneName: "Zone A",
      capacity: 20,
    },
  })

  const zone2 = await prisma.zone.upsert({
    where: { id: "test-zone-b" },
    update: {},
    create: {
      id: "test-zone-b",
      floorId: floor1.id,
      zoneName: "Zone B",
      capacity: 20,
    },
  })

  const zone3 = await prisma.zone.upsert({
    where: { id: "test-zone-c" },
    update: {},
    create: {
      id: "test-zone-c",
      floorId: floor2.id,
      zoneName: "Zone C",
      capacity: 15,
    },
  })

  console.log(`✅ Zones created: ${zone1.zoneName}, ${zone2.zoneName}, ${zone3.zoneName}`)

  // Create test parking bays with various types
  const bayTypes: BayType[] = [
    BayType.STANDARD,
    BayType.STANDARD,
    BayType.STANDARD,
    BayType.STANDARD,
    BayType.STANDARD,
    BayType.ACCESSIBLE,
    BayType.EV_CHARGING,
    BayType.VIP,
    BayType.TWO_WHEELER,
  ]

  const zones = [zone1, zone2, zone3]
  let bayCount = 0

  for (const zone of zones) {
    for (let i = 0; i < 5; i++) {
      const bayType = bayTypes[i % bayTypes.length]
      const isAccessible = bayType === BayType.ACCESSIBLE
      
      await prisma.parkingBay.upsert({
        where: {
          id: `test-bay-${zone.id}-${i}`,
        },
        update: {},
        create: {
          id: `test-bay-${zone.id}-${i}`,
          zoneId: zone.id,
          bayNumber: `${zone.zoneName}-${i + 1}`,
          vehicleType: bayType === BayType.TWO_WHEELER ? VehicleType.TWO_WHEELER : VehicleType.CAR,
          status: BayStatus.AVAILABLE,
          bayType,
          isAccessible,
          isReserved: false,
        },
      })
      bayCount++
    }
  }

  console.log(`✅ Created ${bayCount} test parking bays`)

  // Summary
  console.log("\n📊 Test Data Summary:")
  console.log(`- Site: ${site.name}`)
  console.log(`- Floors: 2`)
  console.log(`- Zones: 3`)
  console.log(`- Total Bays: ${bayCount}`)
  console.log(`- Bay Types: STANDARD, ACCESSIBLE, EV_CHARGING, VIP, TWO_WHEELER`)
  console.log("\n🎉 Test data seeding completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })