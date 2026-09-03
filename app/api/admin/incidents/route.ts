
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    const where: any = {}
    if (status && status !== "ALL") {
      where.status = status
    }

    const [ownerIncidents, parkingIncidents] = await Promise.all([
      prisma.ownerincident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          ownerprofile: {
            include: { user: { select: { name: true, email: true } } }
          }
        }
      }),
      prisma.parkingincident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        // user relation in parkingincident is the reporter, ownerId likely refers to user table
        // check schema: parkingincident(ownerId) -> user(id)
        include: {
          user: { select: { name: true, email: true } }
        }
      })
    ])

    const formattedIncidents = [
      ...ownerIncidents.map(i => ({
        id: i.id,
        type: "OWNER_ISSUE",
        title: i.title,
        description: i.description,
        status: i.status,
        reporter: i.ownerprofile.user.name,
        email: i.ownerprofile.user.email,
        createdAt: i.createdAt
      })),
      ...parkingIncidents.map(i => ({
        id: i.id,
        type: "PARKING_ISSUE",
        title: "Parking Incident", // parkingincident schema description only? check schema
        description: i.description,
        status: i.status,
        reporter: i.user.name,
        email: i.user.email,
        createdAt: i.createdAt
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json(formattedIncidents)
  } catch (error) {
    console.error("Error fetching admin incidents:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}
