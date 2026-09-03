import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json() as { slotId: string; event: "OCCUPIED" | "CHARGING_COMPLETED" };
  if (!body.slotId || !body.event) return NextResponse.json({ error: "slotId and event are required" }, { status: 400 });
  const slot = await prisma.slot.findUnique({ where: { id: body.slotId } });
  if (!slot || slot.slotType !== "EV_CHARGING") return NextResponse.json({ error: "EV charging slot not found" }, { status: 404 });
  if (body.event === "OCCUPIED") return NextResponse.json(await prisma.eVSession.create({ data: { slotId: body.slotId, status: "ACTIVE" } }), { status: 201 });
  const active = await prisma.eVSession.findFirst({ where: { slotId: body.slotId, status: "ACTIVE" }, orderBy: { startTime: "desc" } });
  if (!active) return NextResponse.json({ error: "No active session" }, { status: 409 });
  const graceEndsAt = new Date(Date.now() + 10 * 60_000);
  const session = await prisma.eVSession.update({ where: { id: active.id }, data: { status: "GRACE_PERIOD", endTime: new Date() } });
  return NextResponse.json({ session, alert: "Charging complete. Move your vehicle immediately." });
}
