import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all tickets with owner info
    const tickets = await prisma.ownersupportticket.findMany({
      include: {
        ownerprofile: {
          include: {
            user: {
              select: { name: true, email: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(tickets)
  } catch (error) {
    console.error('Error fetching support tickets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ticketId, message } = await request.json()

    if (!ticketId || !message) {
      return NextResponse.json({ error: 'Ticket ID and message are required' }, { status: 400 })
    }

    // For now, just return success - replies not implemented yet
    return NextResponse.json({ message: 'Reply functionality not implemented' }, { status: 200 })
  } catch (error) {
    console.error('Error creating support reply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ticketId, status } = await request.json()

    if (!ticketId || !status) {
      return NextResponse.json({ error: 'Ticket ID and status are required' }, { status: 400 })
    }

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Update ticket status
    const ticket = await prisma.ownersupportticket.update({
      where: { id: ticketId },
      data: { status }
    })

    return NextResponse.json(ticket)
  } catch (error) {
    console.error('Error updating ticket status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
