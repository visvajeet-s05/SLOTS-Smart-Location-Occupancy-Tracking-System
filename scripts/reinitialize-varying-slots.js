const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Unique slot configs for each of the 8 parking lots
const LOT_CONFIGS = [
  { nameContains: 'Spencer',  total: 80,  occupiedPct: 0.72, reservedPct: 0.08, price: 60  },
  { nameContains: 'Phoenix',  total: 150, occupiedPct: 0.85, reservedPct: 0.05, price: 70  },
  { nameContains: 'Marina',   total: 60,  occupiedPct: 0.30, reservedPct: 0.10, price: 40  },
  { nameContains: 'Chennai',  total: 200, occupiedPct: 0.55, reservedPct: 0.12, price: 50  },
  { nameContains: 'Express',  total: 120, occupiedPct: 0.65, reservedPct: 0.07, price: 65  },
  { nameContains: 'Citi',     total: 95,  occupiedPct: 0.48, reservedPct: 0.15, price: 55  },
  { nameContains: 'Anna',     total: 75,  occupiedPct: 0.20, reservedPct: 0.05, price: 45  },
  { nameContains: 'Nagar',    total: 110, occupiedPct: 0.90, reservedPct: 0.03, price: 50  },
];

function getConfig(lotName) {
  for (const cfg of LOT_CONFIGS) {
    if (lotName.toLowerCase().includes(cfg.nameContains.toLowerCase())) {
      return cfg;
    }
  }
  return { total: 100, occupiedPct: 0.5, reservedPct: 0.1, price: 50 };
}

async function main() {
  console.log('🚀 SEEDING SLOT COUNTS WITH UNIQUE REALISTIC DATA...\n');

  const lots = await prisma.parkinglot.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`Found ${lots.length} parking lots.\n`);

  for (const lot of lots) {
    const cfg   = getConfig(lot.name);
    const total = cfg.total;

    console.log(`📦 ${lot.name} -> ${total} total slots`);

    try {
      // Step 1: get existing slot IDs
      const existingSlots = await prisma.slot.findMany({
        where:  { lotId: lot.id },
        select: { id: true }
      });
      const slotIds = existingSlots.map(s => s.id);

      if (slotIds.length > 0) {
        // Disconnect bookings first
        await prisma.booking.updateMany({
          where: { slotId: { in: slotIds } },
          data:  { slotId: null }
        });
        // Delete compliance violations referencing these slots
        try {
          await prisma.complianceViolation.deleteMany({ where: { slotId: { in: slotIds } } });
        } catch (_) {}
        // Delete EV sessions
        try {
          await prisma.evsession.deleteMany({ where: { slotId: { in: slotIds } } });
        } catch (_) {}
        // Delete the slots
        await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      }

      // Step 2: Build slot status array with realistic distribution
      const occupiedCount  = Math.round(total * cfg.occupiedPct);
      const reservedCount  = Math.round(total * cfg.reservedPct);
      const availableCount = total - occupiedCount - reservedCount;

      const statusArr = [
        ...Array(availableCount).fill('AVAILABLE'),
        ...Array(occupiedCount).fill('OCCUPIED'),
        ...Array(reservedCount).fill('RESERVED'),
      ];

      // Fisher-Yates shuffle
      for (let i = statusArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [statusArr[i], statusArr[j]] = [statusArr[j], statusArr[i]];
      }

      // Step 3: Build slot objects
      let cols = 10;
      if (total > 100) cols = 15;
      if (total > 150) cols = 20;

      const now   = new Date();
      const slots = [];

      for (let i = 0; i < total; i++) {
        const rowNum  = Math.floor(i / cols);
        const colNum  = (i % cols) + 1;
        const rowChar = String.fromCharCode(65 + rowNum);
        const slotNum = i + 1;

        slots.push({
          id:          `slot-${lot.id}-${rowChar}-${colNum}`,
          lotId:       lot.id,
          slotNumber:  slotNum,
          row:         rowChar,
          displayName: `${rowChar}${String(slotNum).padStart(2, '0')}`,
          status:      statusArr[i],
          price:       cfg.price,
          slotType:    'REGULAR',
          x:           0,
          y:           0,
          width:       50,
          height:      40,
          updatedBy:   'SEED',
          updatedAt:   now,
        });
      }

      // Step 4: Create slots in batches of 100
      for (let i = 0; i < slots.length; i += 100) {
        await prisma.slot.createMany({ data: slots.slice(i, i + 100) });
      }

      // Step 5: Update lot totalSlots & ensure ACTIVE
      await prisma.parkinglot.update({
        where: { id: lot.id },
        data:  { totalSlots: total, status: 'ACTIVE', updatedAt: now },
      });

      const avail = statusArr.filter(s => s === 'AVAILABLE').length;
      const occ   = statusArr.filter(s => s === 'OCCUPIED').length;
      const res   = statusArr.filter(s => s === 'RESERVED').length;
      console.log(`   ✅ Available: ${avail} | Occupied: ${occ} | Reserved: ${res}\n`);

    } catch (err) {
      console.error(`   ❌ Failed for ${lot.name}:`, err.message, '\n');
    }
  }

  console.log('🎉 All lots seeded successfully!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());


const CAPACITIES = {
    'CHENNAI_CENTRAL': 200,
    'ANNA_NAGAR': 120,
    'T_NAGAR': 160,
    'VELACHERY': 100,
    'OMR': 240,
    'ADYAR': 80,
    'GUINDY': 140,
    'PORUR': 90
};

async function main() {
    const lots = await prisma.parkinglot.findMany();

    console.log(`🚀 RE-INITIALIZING SLOTS WITH CUSTOM CAPACITIES...`);

    for (const lot of lots) {
        try {
            const randomTotal = Math.floor(Math.random() * (250 - 50 + 1) + 50);
            const totalSlots = randomTotal;
            console.log(`Processing lot: ${lot.name} (${lot.id}) -> Set to ${totalSlots} slots...`);

            // 1. Clear old slots
            const existingSlots = await prisma.slot.findMany({
                where: { lotId: lot.id },
                select: { id: true }
            });
            const slotIds = existingSlots.map(s => s.id);

            if (slotIds.length > 0) {
                // Disconnect bookings to prevent foreign key errors
                await prisma.booking.updateMany({
                    where: { slotId: { in: slotIds } },
                    data: { slotId: null }
                });

                // Delete related logs
                await prisma.slotStatusLog.deleteMany({
                    where: { slotId: { in: slotIds } }
                });

                // Delete the slots
                await prisma.slot.deleteMany({
                    where: { id: { in: slotIds } }
                });
            }

            // 2. Create Custom Slots
            const slots = [];
            // Determine grid layout based on total slots for a neat appearance
            let cols = 15;
            if (totalSlots <= 80) cols = 10;
            else if (totalSlots <= 100) cols = 10;
            else if (totalSlots <= 150) cols = 15;
            else if (totalSlots > 150) cols = 20;

            for (let i = 1; i <= totalSlots; i++) {
                const rowNum = Math.floor((i - 1) / cols);
                const colNum = (i - 1) % cols + 1;
                const rowChar = String.fromCharCode(65 + rowNum);

                const statusRandom = Math.random();
                let status = 'AVAILABLE';
                if (statusRandom > 0.8) {
                    status = 'RESERVED';
                } else if (statusRandom > 0.4) {
                    status = 'OCCUPIED';
                }

                slots.push({
                    id: `slot-${lot.id}-${rowChar}-${colNum}`,
                    lotId: lot.id,
                    slotNumber: i,
                    row: rowChar,
                    displayName: `${rowChar}${String(i).padStart(2, '0')}`,
                    status: status,
                    price: 50,
                    slotType: 'REGULAR',
                    x: 0, // Will be fixed by distribution script
                    y: 0,
                    width: 50,
                    height: 40,
                    updatedBy: 'AI',
                    updatedAt: new Date()
                });
            }

            // 3. Batch Create
            await prisma.slot.createMany({
                data: slots
            });

            // 4. Update Lot Capacity
            await prisma.parkinglot.update({
                where: { id: lot.id },
                data: { totalSlots: totalSlots }
            });

            console.log(`  ✓ Successfully initialized ${totalSlots} slots for ${lot.name}`);
        } catch (e) {
            console.error(`  ❌ Failed to process ${lot.name}:`, e);
        }
    }

    console.log('✅ Custom slot initialization complete.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
