import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return new Response("Unauthorized", { status: 401 })

  const owner = await prisma.ownerprofile.findUnique({
    where: { userId: session.user.id },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          role: true,
          createdAt: true,
        }
      },
      ownerverification: true,
      parkingsetupprogress: true,
      parkinglot: {
        select: {
          id: true,
          name: true,
          address: true,
          status: true,
          totalSlots: true,
        }
      }
    },
  })

  const payload = owner ? {
    ...owner,
    address: owner.address || owner.parkinglot?.[0]?.address || null,
  } : null

  return Response.json(payload)
}
