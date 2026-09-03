import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

// GET /api/admin/events - Get all events
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Return empty events array for now
    // This can be extended to fetch from database
    return NextResponse.json([])
  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/admin/events - Create a new event
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    // Validate required fields
    const { name, description, lat, lng, radiusKm, startTime, endTime, surgeMultiplier } = body
    
    if (!name || !lat || !lng || !radiusKm || !startTime || !endTime || !surgeMultiplier) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Return success response
    // This can be extended to save to database
    return NextResponse.json({
      id: `event_${Date.now()}`,
      name,
      description,
      lat,
      lng,
      radiusKm,
      startTime,
      endTime,
      surgeMultiplier,
      active: true,
      createdBy: session.user.email,
      createdAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error creating event:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
