import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting parking data seed...")

  // Create business owner accounts
  const businessOwners = [
    { email: "spencerplaza@slots.dev", name: "Spencer Plaza Parking", phone: "+919876543213" },
    { email: "phoenixmarketcity@slots.dev", name: "Phoenix Marketcity Parking", phone: "+919876543214" },
    { email: "marinabeach@slots.dev", name: "Marina Beach Parking", phone: "+919876543215" },
    { email: "chennaicentral@slots.dev", name: "Chennai Central Railway Station", phone: "+919876543216" },
    { email: "expressavenue@slots.dev", name: "Express Avenue Mall Parking", phone: "+919876543217" },
    { email: "citicentermall@slots.dev", name: "Chennai Citi Center Mall", phone: "+919876543218" },
    { email: "annanagartower@slots.dev", name: "Anna Nagar Tower Parking", phone: "+919876543219" },
    { email: "tnagarcentral@slots.dev", name: "T Nagar Central Parking", phone: "+919876543220" },
  ]

  const ownerProfiles: any[] = []

  for (const ownerData of businessOwners) {
    const owner = await prisma.user.upsert({
      where: { email: ownerData.email },
      update: {},
      create: {
        email: ownerData.email,
        name: ownerData.name,
        role: "OWNER" as any,
        phone: ownerData.phone,
      },
    })

    const ownerProfile = await prisma.ownerprofile.upsert({
      where: { userId: owner.id },
      update: {},
      create: {
        id: `owner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: owner.id,
        businessName: ownerData.name,
        phone: ownerData.phone,
        status: "APPROVED",
        updatedAt: new Date(),
      },
    })

    ownerProfiles.push({ profile: ownerProfile, email: ownerData.email })
    console.log(`✅ Created owner: ${ownerData.email}`)
  }

  // Chennai parking areas with realistic data - mapped to corresponding business owners
  const parkingAreas = [
    {
      ownerEmail: "tnagarcentral@slots.dev",
      name: "T Nagar Central Parking",
      address: "Usman Road, T Nagar, Chennai",
      lat: 13.0427,
      lng: 80.2277,
      totalSlots: 120,
      status: "ACTIVE" as const,
      defaultPrice: 40,
    },
    {
      ownerEmail: "annanagartower@slots.dev",
      name: "Anna Nagar Tower Parking",
      address: "Anna Nagar Main Road, Chennai",
      lat: 13.0867,
      lng: 80.2107,
      totalSlots: 80,
      status: "ACTIVE" as const,
      defaultPrice: 35,
    },
    {
      ownerEmail: "citicentermall@slots.dev",
      name: "Chennai Citi Center Mall",
      address: "Rajiv Gandhi Salai, Chennai",
      lat: 13.0627,
      lng: 80.2407,
      totalSlots: 200,
      status: "ACTIVE" as const,
      defaultPrice: 50,
    },
    {
      ownerEmail: "expressavenue@slots.dev",
      name: "Express Avenue Mall Parking",
      address: "Whites Road, Chennai",
      lat: 13.0757,
      lng: 80.2607,
      totalSlots: 150,
      status: "ACTIVE" as const,
      defaultPrice: 45,
    },
    {
      ownerEmail: "chennaicentral@slots.dev",
      name: "Chennai Central Railway Station",
      address: "Poonamallee High Road, Chennai",
      lat: 13.0827,
      lng: 80.2707,
      totalSlots: 300,
      status: "ACTIVE" as const,
      defaultPrice: 30,
    },
    {
      ownerEmail: "marinabeach@slots.dev",
      name: "Marina Beach Parking",
      address: "Kamarajar Salai, Chennai",
      lat: 13.0527,
      lng: 80.2807,
      totalSlots: 100,
      status: "ACTIVE" as const,
      defaultPrice: 25,
    },
    {
      ownerEmail: "phoenixmarketcity@slots.dev",
      name: "Phoenix Marketcity Parking",
      address: "Velachery Main Road, Chennai",
      lat: 12.9827,
      lng: 80.2187,
      totalSlots: 250,
      status: "ACTIVE" as const,
      defaultPrice: 55,
    },
    {
      ownerEmail: "spencerplaza@slots.dev",
      name: "Spencer Plaza Parking",
      address: "Anna Salai, Chennai",
      lat: 13.0727,
      lng: 80.2577,
      totalSlots: 90,
      status: "ACTIVE" as const,
      defaultPrice: 35,
    },
  ]

  for (const areaData of parkingAreas) {
    // Find the corresponding owner profile
    const ownerProfile = ownerProfiles.find(op => op.email === areaData.ownerEmail)?.profile
    if (!ownerProfile) {
      console.log(`⚠️ Owner not found for: ${areaData.name}`)
      continue
    }
    const existing = await prisma.parkinglot.findFirst({
      where: { name: areaData.name },
    })

    if (existing) {
      console.log(`✅ Parking area already exists: ${areaData.name}`)
      continue
    }

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: `lot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ownerId: ownerProfile.id,
        name: areaData.name,
        address: areaData.address,
        lat: areaData.lat,
        lng: areaData.lng,
        totalSlots: areaData.totalSlots,
        status: areaData.status,
        updatedAt: new Date(),
      },
    })

    // Create slots for each parking area
    const slotTypes = ["REGULAR", "EV", "DISABLED"]
    for (let i = 1; i <= areaData.totalSlots; i++) {
      const row = String.fromCharCode(65 + Math.floor((i - 1) / 20)) // A, B, C, etc.
      const slotType = slotTypes[Math.floor(Math.random() * slotTypes.length)]
      const slotStatus = Math.random() > 0.7 ? "AVAILABLE" : "OCCUPIED"
      
      await prisma.slot.create({
        data: {
          id: `slot-${parkingLot.id}-${i}`,
          lotId: parkingLot.id,
          slotNumber: i,
          row: row,
          status: slotStatus,
          slotType: slotType,
          price: areaData.defaultPrice,
          aiConfidence: 95 + Math.random() * 5,
          updatedBy: "SYSTEM",
          updatedAt: new Date(),
        },
      })
    }

    console.log(`✅ Created parking area: ${areaData.name} with ${areaData.totalSlots} slots`)
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