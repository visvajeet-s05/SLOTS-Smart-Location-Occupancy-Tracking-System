import { PrismaClient, user_role } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting database seed...")

  // Update existing users instead of deleting to avoid foreign key constraints
  console.log("🔄 Updating existing users...")

  // Hash passwords
  const customer1Password = await bcrypt.hash("visvajeet@123", 12)
  const customer2Password = await bcrypt.hash("manishkumar@123", 12)
  const adminPassword = await bcrypt.hash("admin@123", 12)
  
  // Hash business owner passwords
  const spencerPlazaPassword = await bcrypt.hash("Spencerplaza@Slots", 12)
  const phoenixMarketcityPassword = await bcrypt.hash("Phoenixmarketcity@Slots", 12)
  const marinaBeachPassword = await bcrypt.hash("Marinabeach@Slots", 12)
  const chennaiCentralPassword = await bcrypt.hash("Chennaicentral@Slots", 12)
  const expressAvenuePassword = await bcrypt.hash("Expressavenue@Slots", 12)
  const citiCenterPassword = await bcrypt.hash("Citicentermall@Slots", 12)
  const annaNagarPassword = await bcrypt.hash("Annanagartower@Slots", 12)
  const tNagarPassword = await bcrypt.hash("Tnagarcentral@Slots", 12)

  // Create test users
  const users = [
    {
      email: "visvajeet@gmail.com",
      name: "Visvajeet",
      passwordHash: customer1Password,
      role: "CUSTOMER" as user_role,
      phone: "+919876543210",
    },
    {
      email: "manishkumar@gmail.com",
      name: "Manish Kumar",
      passwordHash: customer2Password,
      role: "CUSTOMER" as user_role,
      phone: "+919876543211",
    },
    {
      email: "admin@gmail.com",
      name: "Admin",
      passwordHash: adminPassword,
      role: "SUPER_ADMIN" as user_role,
      phone: "+919876543212",
    },
    // Business Owner Accounts
    {
      email: "spencerplaza@slots.dev",
      name: "Spencer Plaza Parking",
      passwordHash: spencerPlazaPassword,
      role: "OWNER" as user_role,
      phone: "+919876543213",
    },
    {
      email: "phoenixmarketcity@slots.dev",
      name: "Phoenix Marketcity Parking",
      passwordHash: phoenixMarketcityPassword,
      role: "OWNER" as user_role,
      phone: "+919876543214",
    },
    {
      email: "marinabeach@slots.dev",
      name: "Marina Beach Parking",
      passwordHash: marinaBeachPassword,
      role: "OWNER" as user_role,
      phone: "+919876543215",
    },
    {
      email: "chennaicentral@slots.dev",
      name: "Chennai Central Railway Station",
      passwordHash: chennaiCentralPassword,
      role: "OWNER" as user_role,
      phone: "+919876543216",
    },
    {
      email: "expressavenue@slots.dev",
      name: "Express Avenue Mall Parking",
      passwordHash: expressAvenuePassword,
      role: "OWNER" as user_role,
      phone: "+919876543217",
    },
    {
      email: "citicentermall@slots.dev",
      name: "Chennai Citi Center Mall",
      passwordHash: citiCenterPassword,
      role: "OWNER" as user_role,
      phone: "+919876543218",
    },
    {
      email: "annanagartower@slots.dev",
      name: "Anna Nagar Tower Parking",
      passwordHash: annaNagarPassword,
      role: "OWNER" as user_role,
      phone: "+919876543219",
    },
    {
      email: "tnagarcentral@slots.dev",
      name: "T Nagar Central Parking",
      passwordHash: tNagarPassword,
      role: "OWNER" as user_role,
      phone: "+919876543220",
    },
  ]

  for (const userData of users) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    })

    if (existingUser) {
      // Update existing user
      await prisma.user.update({
        where: { email: userData.email },
        data: {
          passwordHash: userData.passwordHash,
          role: userData.role,
          name: userData.name,
          phone: userData.phone,
        },
      })
      console.log(`✅ Updated user: ${userData.email} (${userData.role})`)
    } else {
      // Create new user
      await prisma.user.create({
        data: userData,
      })
      console.log(`✅ Created user: ${userData.email} (${userData.role})`)
    }
  }

  console.log("🎉 Seed completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })