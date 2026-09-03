import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🔍 Checking for duplicate parking lots in database...")

  // Fetch all parking lots
  const allLots = await prisma.parkinglot.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      ownerId: true,
    },
  })

  console.log(`Found ${allLots.length} parking lots in database`)

  // Group by name to find duplicates
  const lotsByName = allLots.reduce((acc, lot) => {
    const key = lot.name.toLowerCase().trim()
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(lot)
    return acc
  }, {} as Record<string, any[]>)

  // Find duplicates
  const duplicates: string[] = []
  for (const [name, lots] of Object.entries(lotsByName)) {
    if (lots.length > 1) {
      duplicates.push(name)
      console.log(`⚠️ Duplicate found: "${name}" (${lots.length} entries)`)
      lots.forEach((lot, idx) => {
        console.log(`   ${idx + 1}. ID: ${lot.id}, Owner: ${lot.ownerId}`)
      })
    }
  }

  if (duplicates.length === 0) {
    console.log("✅ No duplicates found in database")
    return
  }

  console.log(`\n📋 Found ${duplicates.length} duplicate(s)`)

  if (duplicates.length === 0) {
    console.log("✅ No duplicates found in database")
    return
  }

  // Delete duplicates
  console.log("\n🗑️ Deleting duplicates...")
  
  for (const duplicateName of duplicates) {
    const lots = lotsByName[duplicateName]
    // Keep the first one, delete the rest
    const toDelete = lots.slice(1)
    
    for (const lot of toDelete) {
      // Delete slots first (foreign key constraint)
      await prisma.slot.deleteMany({
        where: { lotId: lot.id }
      })
      
      // Delete the parking lot
      await prisma.parkinglot.delete({
        where: { id: lot.id }
      })
      
      console.log(`✅ Deleted duplicate: ${lot.id} (${duplicateName})`)
    }
  }
  
  console.log("🎉 Duplicates removed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })