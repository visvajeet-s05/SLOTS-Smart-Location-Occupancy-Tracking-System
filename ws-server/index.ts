import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient, SlotStatus, UpdatedBy } from "@prisma/client";
import { createServer, IncomingMessage, ServerResponse } from "http";

const prisma = new PrismaClient();

// Role type for subscription management
type Role = "OWNER" | "CUSTOMER";

// Subscription management - SAFELY INITIALIZED
const subscriptions: Record<string, { OWNER: Set<WebSocket>; CUSTOMER: Set<WebSocket> }> = {};

// Global customers subscription (subscribe to ALL parking lots)
const globalCustomers: Set<WebSocket> = new Set();


// Real-time processing for AI updates (No batching for maximum speed)
const BATCH_INTERVAL = 100; // Minimal buffer for extreme high-frequency bursts (0.1s)

type SlotUpdate = {
  lotSlug: string;
  slotNumber: number;
  status: SlotStatus;
  confidence?: number;
  source: UpdatedBy;
};


// Railway injects $PORT automatically in production; fallback to 4000 for local dev
const PORT = parseInt(process.env.PORT || '4000', 10);


// Create HTTP server for health checks and broadcasting
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'smart-parking-ws-server',
      connections: wss.clients.size
    }));
  } else if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log("📢 Received broadcast request:", data.type);

        if (data.type === "SLOT_UPDATE") {
          broadcastUpdate(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else if (data.type === "BULK_SLOT_UPDATE" && Array.isArray(data.updates)) {
          console.log(`📦 Processing BULK update with ${data.updates.length} items`);
          // Iterate and broadcast each update individually to maintain client compatibility
          // This moves the N-requests load from HTTP to internal WS loop (much faster)
          data.updates.forEach((update: any) => {
            broadcastUpdate(update);
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid broadcast type" }));
        }
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

// Slot Priority Logic (IMPORTANT)
function canOverride(existing: UpdatedBy, incoming: UpdatedBy): boolean {
  const priority: Record<string, number> = { OWNER: 3, CUSTOMER: 2, AI: 1 };
  return priority[incoming] >= priority[existing];
}


console.log(`🟢 WebSocket Server running on ws://localhost:${PORT}`);
server.listen(PORT, () => {
  console.log(`🚀 HTTP/WebSocket server listening on port ${PORT}`);
});

wss.on("connection", (ws: WebSocket) => {
  console.log("🔌 New client connected");

  // Add ping responder for clients that ping the server
  ws.on("message", async (raw: Buffer) => {
    try {
      const data = JSON.parse(raw.toString());
      console.log("📥 Received:", data);

      // Handle ping/pong for connection health (check first - control message)
      if (data.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG" }));
        return;
      }

      // Handle subscription requests
      if (data.type === "SUBSCRIBE") {
        const lotId = data.lotId;
        const role = data.role as Role;

        if (!role) {
          console.error("❌ Missing role in SUBSCRIBE");
          return;
        }

        // Global customer subscription (no specific lotId)
        if ((role as any) === "CUSTOMER" && !lotId) {
          globalCustomers.add(ws);
          console.log(`✅ CUSTOMER subscribed to ALL parking lots globally`);

          // Send confirmation
          ws.send(JSON.stringify({
            type: "SUBSCRIBED",
            role: "CUSTOMER",
            scope: "GLOBAL",
            message: "Subscribed to all parking lot updates"
          }));
          return;
        }

        // Specific lot subscription
        if (lotId) {
          // 🔥 CRITICAL FIX: Always initialize before use
          if (!subscriptions[lotId]) {
            subscriptions[lotId] = {
              OWNER: new Set(),
              CUSTOMER: new Set(),
            };
          }

          subscriptions[lotId][role].add(ws);
          console.log(`✅ ${role} subscribed to ${lotId}`);

          // Send confirmation
          ws.send(JSON.stringify({
            type: "SUBSCRIBED",
            role,
            lotId,
            message: `Subscribed to ${lotId}`
          }));
        }
        return;
      }


      // Handle slot updates (existing functionality)
      if (data.lotSlug && data.slotNumber !== undefined) {
        const slotData = data as SlotUpdate;

        // ALL updates are now processed immediately for millisecond response
        await processImmediateUpdate(slotData);
        return;
      }


    } catch (error) {
      console.error("❌ Error processing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("🔌 Client disconnected");

    // Cleanup: Remove from all subscriptions
    for (const lotId in subscriptions) {
      subscriptions[lotId].OWNER.delete(ws);
      subscriptions[lotId].CUSTOMER.delete(ws);
    }

    // Cleanup: Remove from global customers
    globalCustomers.delete(ws);
  });


  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});


// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down WebSocket server...");
  clearInterval(heartbeatInterval);
  wss.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down WebSocket server...");
  clearInterval(heartbeatInterval);
  wss.close();
  await prisma.$disconnect();
  process.exit(0);
});

// STEP 7: Add Heartbeat (Keep Alive) 
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "PING" }));
    }
  });
}, 10000); // Send PING every 10 seconds

// Process immediate update (for OWNER priority)
async function processImmediateUpdate(data: SlotUpdate) {
  try {
    // Find the parking lot
    const lot = await prisma.parkinglot.findUnique({
      where: { id: data.lotSlug },
      include: { slots: true },
    });

    if (!lot) {
      console.error("❌ Parking lot not found:", data.lotSlug);
      return;
    }

    // Find the specific slot
    const slot = lot.slots.find((s: any) => s.slotNumber === data.slotNumber);
    if (!slot) {
      console.error("❌ Slot not found:", data.slotNumber);
      return;
    }

    // Priority check: can this update override the existing status?
    if (!canOverride(slot.updatedBy, data.source)) {
      console.log(`⛔ Blocked: ${data.source} cannot override ${slot.updatedBy}`);
      return;
    }

    // Update slot in DB
    await prisma.slot.update({
      where: { id: slot.id },
      data: {
        status: data.status,
        aiConfidence: data.confidence ?? 100,
        updatedBy: data.source,
      },
    });

    // Create status log entry
    await prisma.slotStatusLog.create({
      data: {
        slotId: slot.id,
        oldStatus: slot.status,
        newStatus: data.status,
        updatedBy: data.source,
        aiConfidence: data.confidence ?? 100,
      },
    });

    // Broadcast update
    broadcastUpdate({ ...data, slotId: slot.id });
    console.log(`✅ Immediate update processed: Slot ${data.slotNumber} -> ${data.status}`);
  } catch (error) {
    console.error("❌ Error in immediate update:", error);
  }
}


// Process all queued batch updates (DEPRECATED - Processing is now real-time)
async function processBatchUpdates() {
  // Logic removed for real-time performance
}


// Broadcast update to all connected clients
function broadcastUpdate(data: any) {
  const lotId = data.lotId || data.lotSlug;
  const broadcastData = JSON.stringify({
    type: data.type || "SLOT_UPDATE",
    ...data,
    lotId, // Ensure lotId is present
    timestamp: new Date().toISOString(),
  });

  // Broadcast to specific lot subscribers
  if (lotId && subscriptions[lotId]) {
    subscriptions[lotId].OWNER.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(broadcastData);
      }
    });
    subscriptions[lotId].CUSTOMER.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(broadcastData);
      }
    });
  }

  // Broadcast to global customers (all parking lots)
  globalCustomers.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(broadcastData);
    }
  });

  console.log(`📤 Broadcasted slot update for ${data.lotSlug} to all subscribers`);
}


// Broadcast to specific lot subscribers by role
function broadcastToLot(lotId: string, role: Role, message: any) {
  if (!subscriptions[lotId]) return;

  const data = JSON.stringify(message);
  const subscribers = subscriptions[lotId][role];

  subscribers.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  console.log(`📤 Broadcasted to ${role}s of ${lotId}`);
}
