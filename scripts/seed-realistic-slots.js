const { PrismaClient } = require("@prisma/client");
require('dotenv').config();
const prisma = new PrismaClient();

const LOT_CONFIGS = [
  { nameContains: "Spencer",  total: 80,  occupiedPct: 0.72, reservedPct: 0.08, price: 60  },
  { nameContains: "Phoenix",  total: 150, occupiedPct: 0.85, reservedPct: 0.05, price: 70  },
  { nameContains: "Marina",   total: 60,  occupiedPct: 0.30, reservedPct: 0.10, price: 40  },
  { nameContains: "Chennai",  total: 200, occupiedPct: 0.55, reservedPct: 0.12, price: 50  },
  { nameContains: "Express",  total: 120, occupiedPct: 0.65, reservedPct: 0.07, price: 65  },
  { nameContains: "Citi",     total: 95,  occupiedPct: 0.48, reservedPct: 0.15, price: 55  },
  { nameContains: "Anna",     total: 75,  occupiedPct: 0.20, reservedPct: 0.05, price: 45  },
  { nameContains: "Nagar",    total: 110, occupiedPct: 0.90, reservedPct: 0.03, price: 50  },
];

function getConfig(lotName) {
  for (const cfg of LOT_CONFIGS) {
    if (lotName.toLowerCase().includes(cfg.nameContains.toLowerCase())) return cfg;
  }
  return { total: 100, occupiedPct: 0.5, reservedPct: 0.1, price: 50 };
}

async function main() {
  console.log("🚀 SEEDING WITH UNIQUE REALISTIC SLOT COUNTS...\n");
  const lots = await prisma.parkinglot.findMany({ orderBy: { createdAt: "asc" } });
  console.log("Found " + lots.length + " lots.\n");

  for (const lot of lots) {
    const cfg   = getConfig(lot.name);
    const total = cfg.total;
    console.log("📦 " + lot.name + " -> " + total + " slots");
    try {
      const existingSlots = await prisma.slot.findMany({ where: { lotId: lot.id }, select: { id: true } });
      const slotIds = existingSlots.map(function(s) { return s.id; });
      if (slotIds.length > 0) {
        await prisma.booking.updateMany({ where: { slotId: { in: slotIds } }, data: { slotId: null } });
        try { await prisma.complianceViolation.deleteMany({ where: { slotId: { in: slotIds } } }); } catch(e2) {}
        try { await prisma.evsession.deleteMany({ where: { slotId: { in: slotIds } } }); } catch(e3) {}
        await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      }

      const occupiedCount  = Math.round(total * cfg.occupiedPct);
      const reservedCount  = Math.round(total * cfg.reservedPct);
      const availableCount = total - occupiedCount - reservedCount;
      const statusArr = Array(availableCount).fill("AVAILABLE").concat(Array(occupiedCount).fill("OCCUPIED")).concat(Array(reservedCount).fill("RESERVED"));
      for (var si = statusArr.length - 1; si > 0; si--) {
        var sj = Math.floor(Math.random() * (si + 1));
        var tmp = statusArr[si]; statusArr[si] = statusArr[sj]; statusArr[sj] = tmp;
      }

      var cols = 10;
      if (total > 100) cols = 15;
      if (total > 150) cols = 20;

      var now = new Date();
      var slots = [];
      for (var i = 0; i < total; i++) {
        var rowNum  = Math.floor(i / cols);
        var colNum  = (i % cols) + 1;
        var rowChar = String.fromCharCode(65 + rowNum);
        var slotNum = i + 1;
        slots.push({
          id:          "slot-" + lot.id + "-" + rowChar + "-" + colNum,
          lotId:       lot.id,
          slotNumber:  slotNum,
          row:         rowChar,
          displayName: rowChar + String(slotNum).padStart(2, "0"),
          status:      statusArr[i],
          price:       cfg.price,
          slotType:    "REGULAR",
          x:           0,
          y:           0,
          width:       50,
          height:      40,
          updatedBy:   "AI",
          updatedAt:   now
        });
      }

      for (var bi = 0; bi < slots.length; bi += 100) {
        await prisma.slot.createMany({ data: slots.slice(bi, bi + 100) });
      }
      await prisma.parkinglot.update({ where: { id: lot.id }, data: { totalSlots: total, status: "ACTIVE", updatedAt: now } });

      var avail = statusArr.filter(function(s) { return s === "AVAILABLE"; }).length;
      var occ   = statusArr.filter(function(s) { return s === "OCCUPIED"; }).length;
      var res   = statusArr.filter(function(s) { return s === "RESERVED"; }).length;
      console.log("   ✅ Available: " + avail + " | Occupied: " + occ + " | Reserved: " + res + "\n");
    } catch(err) {
      console.error("   ❌ " + lot.name + ":", err.message, "\n");
    }
  }
  console.log("🎉 Done!");
}

main()
  .catch(function(e) { console.error(e); process.exit(1); })
  .finally(function() { return prisma.$disconnect(); });
