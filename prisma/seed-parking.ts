import { PrismaClient, parkinglot_status, parkingslot_type } from "@prisma/client"
import dotenv from "dotenv"

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting parking data seed...")

  // Step 1: Get existing OWNER users from the database
  console.log("📋 Fetching existing OWNER users...")
  const ownerEmails = [
    "spencerplaza@slots.dev",
    "phoenixmarketcity@slots.dev",
    "marinabeach@slots.dev",
    "chennaicentral@slots.dev",
    "expressavenue@slots.dev",
    "citicentermall@slots.dev",
    "annanagartower@slots.dev",
    "tnagarcentral@slots.dev",
  ]

  const owners = await prisma.user.findMany({
    where: {
      email: { in: ownerEmails },
      role: "OWNER",
    },
  })

  console.log(`✅ Found ${owners.length} OWNER users`)

  if (owners.length === 0) {
    console.error("❌ No OWNER users found. Please run seed.ts first to create users.")
    process.exit(1)
  }

  // Step 2: Create OwnerProfile for each owner if it doesn't exist
  const ownerProfiles: any[] = []
  for (const owner of owners) {
    let ownerProfile = await prisma.ownerprofile.findUnique({
      where: { userId: owner.id },
    })

    if (!ownerProfile) {
      ownerProfile = await prisma.ownerprofile.create({
        data: {
          id: `owner-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          userId: owner.id,
          businessName: owner.name || owner.email,
          phone: owner.phone || "+919876543200",
          status: "APPROVED",
          updatedAt: new Date(),
        },
      })
      console.log(`✅ Created OwnerProfile for: ${owner.email}`)
    } else {
      console.log(`✅ OwnerProfile already exists for: ${owner.email}`)
    }

    ownerProfiles.push({ profile: ownerProfile, email: owner.email })
  }

  // Step 3: Define parking lots with realistic Chennai locations
  const parkingLotsData = [
    {
      ownerEmail: "spencerplaza@slots.dev",
      name: "Spencer Plaza Parking",
      address: "Anna Salai, T. Nagar, Chennai - 600017",
      lat: 13.0585,
      lng: 80.2476,
      totalSlots: 80,
      basePrice: 60,
    },
    {
      ownerEmail: "phoenixmarketcity@slots.dev",
      name: "Phoenix Marketcity Parking",
      address: "Velachery Main Road, Velachery, Chennai - 600042",
      lat: 13.0637,
      lng: 80.2119,
      totalSlots: 100,
      basePrice: 70,
    },
    {
      ownerEmail: "marinabeach@slots.dev",
      name: "Marina Beach Parking",
      address: "Kamarajar Salai, Marina Beach, Chennai - 600005",
      lat: 13.0500,
      lng: 80.2822,
      totalSlots: 60,
      basePrice: 50,
    },
    {
      ownerEmail: "chennaicentral@slots.dev",
      name: "Chennai Central Parking",
      address: "Poonamallee High Road, Chennai Central, Chennai - 600003",
      lat: 13.0827,
      lng: 80.2707,
      totalSlots: 120,
      basePrice: 55,
    },
    {
      ownerEmail: "expressavenue@slots.dev",
      name: "Express Avenue Mall Parking",
      address: "Whites Road, Royapettah, Chennai - 600014",
      lat: 13.0521,
      lng: 80.2570,
      totalSlots: 90,
      basePrice: 65,
    },
    {
      ownerEmail: "citicentermall@slots.dev",
      name: "Citi Center Mall Parking",
      address: "Rajiv Gandhi Salai, Chennai - 600002",
      lat: 13.0550,
      lng: 80.2500,
      totalSlots: 85,
      basePrice: 58,
    },
    {
      ownerEmail: "annanagartower@slots.dev",
      name: "Anna Nagar Tower Parking",
      address: "Anna Nagar Main Road, Anna Nagar, Chennai - 600040",
      lat: 13.0891,
      lng: 80.2108,
      totalSlots: 75,
      basePrice: 52,
    },
    {
      ownerEmail: "tnagarcentral@slots.dev",
      name: "T Nagar Central Parking",
      address: "Usman Road, T. Nagar, Chennai - 600017",
      lat: 13.0400,
      lng: 80.2336,
      totalSlots: 95,
      basePrice: 62,
    },
  ]

  // Step 4: Create parking lots with slots, levels, and pricing rules
  for (const lotData of parkingLotsData) {
    try {
      // Find the corresponding owner profile
      const ownerProfile = ownerProfiles.find((op) => op.email === lotData.ownerEmail)?.profile
      if (!ownerProfile) {
        console.log(`⚠️ Owner profile not found for: ${lotData.name}`)
        continue
      }

      // Check if parking lot already exists
      const existingLot = await prisma.parkinglot.findFirst({
        where: { name: lotData.name },
      })

      if (existingLot) {
        console.log(`✅ Parking lot already exists: ${lotData.name}`)
        continue
      }

      // Create parking lot
      const parkingLot = await prisma.parkinglot.create({
        data: {
          id: `lot-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          ownerId: ownerProfile.id,
          name: lotData.name,
          address: lotData.address,
          lat: lotData.lat,
          lng: lotData.lng,
          totalSlots: lotData.totalSlots,
          status: parkinglot_status.ACTIVE,
          timezone: "Asia/Kolkata",
          updatedAt: new Date(),
        },
      })

      console.log(`✅ Created parking lot: ${lotData.name}`)

      // Step 5: Create parking levels (2-3 levels per lot)
      const numLevels = Math.floor(Math.random() * 2) + 2 // 2 or 3 levels
      const levels: any[] = []

      for (let levelNum = 1; levelNum <= numLevels; levelNum++) {
        const level = await prisma.parkinglevel.create({
          data: {
            id: `level-${parkingLot.id}-${levelNum}`,
            parkingLotId: parkingLot.id,
            levelName: `Level ${levelNum}`,
            floorNumber: levelNum,
            totalSlots: Math.floor(lotData.totalSlots / numLevels),
            cameraCount: Math.floor(Math.random() * 3) + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })
        levels.push(level)
        console.log(`  ✅ Created parking level: ${level.levelName}`)
      }

      // Step 6: Create parking slots (50-100 slots per lot)
      const slotTypes: parkingslot_type[] = ["REGULAR", "EV", "DISABLED"]
      const slotsPerLevel = Math.floor(lotData.totalSlots / numLevels)

      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        const level = levels[levelIndex]
        
        for (let i = 1; i <= slotsPerLevel; i++) {
          const slotType = slotTypes[Math.floor(Math.random() * slotTypes.length)]
          const slotNumber = `${String.fromCharCode(65 + levelIndex)}${i.toString().padStart(3, '0')}`

          await prisma.parkingslot.create({
            data: {
              id: `slot-${parkingLot.id}-${level.id}-${i}`,
              parkingLotId: parkingLot.id,
              slotNumber: slotNumber,
              type: slotType,
              isActive: true,
              createdAt: new Date(),
            },
          })
        }
        console.log(`  ✅ Created ${slotsPerLevel} slots for ${level.levelName}`)
      }

      // Step 7: Create pricing rule with base price around ₹50-80/hr
      const pricingRule = await prisma.pricingrule.create({
        data: {
          id: `pricing-${parkingLot.id}`,
          parkingLotId: parkingLot.id,
          basePrice: lotData.basePrice,
          hourlyRate: lotData.basePrice * 1.5, // 1.5x base price for hourly rate
          dynamic: false,
          currentPrice: lotData.basePrice,
          lastUpdated: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      console.log(`  ✅ Created pricing rule: ₹${lotData.basePrice}/hr base price`)
      console.log(`🎉 Completed setup for: ${lotData.name} (${lotData.totalSlots} slots, ${numLevels} levels)`)

    } catch (error) {
      console.error(`❌ Error creating parking lot ${lotData.name}:`, error)
      continue
    }
  }

  console.log("🎉 Parking data seed completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })