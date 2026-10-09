/**
 * ============================================================
 *  RESERVATION MANAGER — Smart Parking
 * ============================================================
 *  Handles in-memory slot reservations with 15-minute timeouts.
 *  Uses correct Prisma models: Slot, SlotStatusLog, UpdatedBy.
 * ============================================================
 */

import { prisma } from "@/lib/prisma";
import type { slot_status, slot_updatedBy } from "@prisma/client";

// ── Config ──────────────────────────────────────────────────
const RESERVATION_TIMEOUT_MINUTES = 15;
const WS_SERVER_URL = process.env.WS_SERVER_URL || `http://localhost:${process.env.WS_PORT || 4000}`;

// ── Types ────────────────────────────────────────────────────
interface Reservation {
  slotId: string;
  userId: string;
  reservedAt: Date;
  expiresAt: Date;
}

// In-memory reservation tracking (for quick lookups)
const activeReservations = new Map<string, Reservation>();

// ─────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Create a new reservation with a 15-minute timeout.
 */
export async function createReservation(
  slotId: string,
  userId: string
): Promise<Reservation> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TIMEOUT_MINUTES * 60 * 1000);

  const reservation: Reservation = { slotId, userId, reservedAt: now, expiresAt };

  // Store in memory
  activeReservations.set(slotId, reservation);

  // Update slot status in database
  await prisma.slot.update({
    where: { id: slotId },
    data: {
      status: "RESERVED" as slot_status,
      updatedBy: "CUSTOMER" as slot_updatedBy,
      aiConfidence: 100,
    },
  });

  // Log status change
  await prisma.slotstatuslog.create({
    data: {
      slotId,
      oldStatus: "AVAILABLE",
      newStatus: "RESERVED",
      updatedBy: "CUSTOMER",
      aiConfidence: 100,
    },
  });

  // Broadcast via WebSocket (fire-and-forget)
  _broadcastSlotUpdate(slotId, "RESERVED").catch(() => {});

  // Schedule timeout
  _scheduleTimeoutCheck(slotId, expiresAt);

  console.log(`✅ Reservation created: slot=${slotId}, expires=${expiresAt.toISOString()}`);
  return reservation;
}

/**
 * Cancel a reservation and release the slot back to AVAILABLE.
 */
export async function cancelReservation(slotId: string): Promise<boolean> {
  if (!activeReservations.has(slotId)) return false;

  activeReservations.delete(slotId);

  await prisma.slot.update({
    where: { id: slotId },
    data: {
      status: "AVAILABLE" as slot_status,
      updatedBy: "OWNER" as slot_updatedBy,
      aiConfidence: 100,
    },
  });

  await prisma.slotstatuslog.create({
    data: {
      slotId,
      oldStatus: "RESERVED",
      newStatus: "AVAILABLE",
      updatedBy: "OWNER",
      aiConfidence: 100,
    },
  });

  _broadcastSlotUpdate(slotId, "AVAILABLE").catch(() => {});
  console.log(`❌ Reservation cancelled: slot=${slotId}`);
  return true;
}

/**
 * Complete a reservation (slot becomes OCCUPIED via booking).
 */
export async function completeReservation(slotId: string): Promise<boolean> {
  if (!activeReservations.has(slotId)) return false;
  activeReservations.delete(slotId);
  console.log(`✅ Reservation completed: slot=${slotId}`);
  return true;
}

/**
 * Check if a reservation has expired; release slot if so.
 */
export async function checkReservationTimeout(slotId: string): Promise<boolean> {
  const reservation = activeReservations.get(slotId);
  if (!reservation) return false;

  if (new Date() > reservation.expiresAt) {
    console.log(`⏰ Reservation expired: slot=${slotId}`);
    activeReservations.delete(slotId);

    await prisma.slot.update({
      where: { id: slotId },
      data: {
        status: "AVAILABLE" as slot_status,
        updatedBy: "AI" as slot_updatedBy,
        aiConfidence: 100,
      },
    });

    await prisma.slotstatuslog.create({
      data: {
        slotId,
        oldStatus: "RESERVED",
        newStatus: "AVAILABLE",
        updatedBy: "AI",
        aiConfidence: 100,
      },
    });

    _broadcastSlotUpdate(slotId, "AVAILABLE").catch(() => {});
    return true;
  }

  return false;
}

/** Get all active in-memory reservations. */
export function getActiveReservations(): Reservation[] {
  return Array.from(activeReservations.values());
}

/** Get reservation for a specific slot. */
export function getReservation(slotId: string): Reservation | undefined {
  return activeReservations.get(slotId);
}

/** Check if a slot has an active reservation. */
export function hasActiveReservation(slotId: string): boolean {
  return activeReservations.has(slotId);
}

/**
 * Initialize reservation manager on startup — rebuilds in-memory
 * state from any RESERVED slots currently in the database.
 */
export async function initializeReservations() {
  console.log("🔄 Initializing reservation manager...");

  try {
    const reservedSlots = await prisma.slot.findMany({
      where: { status: "RESERVED" as slot_status },
    });

    for (const slot of reservedSlots) {
      const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MINUTES * 60 * 1000);
      const reservation: Reservation = {
        slotId: slot.id,
        userId: "unknown",
        reservedAt: new Date(),
        expiresAt,
      };
      activeReservations.set(slot.id, reservation);
      _scheduleTimeoutCheck(slot.id, expiresAt);
    }

    console.log(`✅ Reservation manager ready — ${reservedSlots.length} active reservations`);
  } catch (err: any) {
    console.warn("⚠️ Reservation manager initialization skipped / deferred:", err?.message || err);
  }
}

// ─────────────────────────────────────────────────────────────
//  INTERNALS
// ─────────────────────────────────────────────────────────────

function _scheduleTimeoutCheck(slotId: string, expiresAt: Date) {
  const delay = expiresAt.getTime() - Date.now();
  if (delay > 0) {
    setTimeout(() => checkReservationTimeout(slotId), delay);
  }
}

async function _broadcastSlotUpdate(slotId: string, status: string) {
  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: globalThis.fetch }));
    await (fetch as typeof globalThis.fetch)(`${WS_SERVER_URL}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "SLOT_UPDATE",
        slotId,
        status,
        source: "SYSTEM",
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(500),
    });
  } catch {
    // WS server may not be running — gracefully ignore
  }
}

// Auto-initialize on module load
initializeReservations().catch(console.error);
