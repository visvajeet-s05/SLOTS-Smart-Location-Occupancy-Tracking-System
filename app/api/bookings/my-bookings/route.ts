import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, isAuthenticated } from "@/lib/auth"
import { getUserBookings } from "@/lib/booking-engine"

export async function GET(req: NextRequest) {
  try {
    // Require authentication
    const isAuth = await isAuthenticated()
    if (!isAuth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    const session = await getAuthSession()
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Get user's bookings
    const bookings = await getUserBookings(userId)
    
    // Group bookings by status
    const activeBookings = bookings.filter(b => 
      b.status === "ACTIVE" || b.status === "CONFIRMED"
    )
    const upcomingBookings = bookings.filter(b => 
      b.status === "CONFIRMED" && new Date(b.startTime) > new Date()
    )
    const completedBookings = bookings.filter(b => 
      b.status === "COMPLETED"
    )
    const cancelledBookings = bookings.filter(b => 
      b.status === "CANCELLED" || b.status === "EXPIRED"
    )
    
    return NextResponse.json({
      success: true,
      bookings: {
        all: bookings,
        active: activeBookings,
        upcoming: upcomingBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
      },
      summary: {
        total: bookings.length,
        active: activeBookings.length,
        upcoming: upcomingBookings.length,
        completed: completedBookings.length,
        cancelled: cancelledBookings.length,
      },
    })
  } catch (error: any) {
    console.error("Get my bookings error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}