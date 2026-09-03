import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthSession, requireRole } from "@/lib/auth"
import { logUnauthorizedAccess } from "@/lib/audit"

export async function GET(req: NextRequest) {
  try {
    // Require SUPER_ADMIN role
    await requireRole(["SUPER_ADMIN"])
    
    const session = await getAuthSession()
    const userId = session?.user?.id
    
    // Get query parameters for pagination
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "10")
    const search = searchParams.get("search") || ""
    
    const skip = (page - 1) * limit
    
    // Build where clause for search
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}
    
    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])
    
    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    if (error.message === "FORBIDDEN") {
      // Log unauthorized access attempt
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
      const userAgent = req.headers.get("user-agent") || "unknown"
      await logUnauthorizedAccess("/api/admin/users", ip, userAgent)
      
      return NextResponse.json(
        { error: "Forbidden - SUPER_ADMIN role required" },
        { status: 403 }
      )
    }
    
    console.error("Get users error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}