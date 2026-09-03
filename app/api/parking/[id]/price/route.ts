import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { pricingEngine } from '@/lib/pricing-engine'
import { authOptions } from '@/lib/auth-options'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id: parkingLotId } = await params


    if (!parkingLotId) {
      return NextResponse.json(
        { error: 'Parking lot ID is required' },
        { status: 400 }
      )
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const durationHours = parseFloat(searchParams.get('duration') || '1')
    const vehicleType = searchParams.get('vehicleType') || 'REGULAR'

    const pricingInput = {
      parkingLotId,
      userId: session?.user?.id,
      durationHours,
      vehicleType
    }

    const pricingResult = await pricingEngine.calculatePrice(pricingInput)

    return NextResponse.json(pricingResult)
  } catch (error) {
    console.error('Price calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate pricing' },
      { status: 500 }
    )
  }
}
