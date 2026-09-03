import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthSession, requireRole } from "@/lib/auth"
import { logRoleChange, logUnauthorizedAccess } from "@/lib/audit"
import { z } from "zod"

const updateRoleSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "CUSTOMER", "OWNER"]),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = (await params).id
  
  try {
    // Require SUPER_ADMIN role
    await requireRole(["SUPER_ADMIN"])
    
    const session = await getAuthSession()
    const adminId = session?.user?.id
    
    // Validate input
    const body = await req.json()
    const validatedData = updateRoleSchema.parse(body)
    
    // Get current user role
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    
    if (!currentUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }
    
    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: validatedData.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    })
    
    // Log role change
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logRoleChange(
      userId,
      currentUser.role,
      validatedData.role,
      adminId!,
      ip,
      userAgent
    )
    
    return NextResponse.json({
      message: "User role updated successfully",
      user: updatedUser,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid role", details: error.errors },
        { status: 400 }
      )
    }
    
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    if (error.message === "FORBIDDEN") {
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
      const userAgent = req.headers.get("user-agent") || "unknown"
      await logUnauthorizedAccess(`/api/admin/users/${userId}/role`, ip, userAgent)
      
      return NextResponse.json(
        { error: "Forbidden - SUPER_ADMIN role required" },
        { status: 403 }
      )
    }
    
    console.error("Update user role error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}