import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { applyRateLimit, RATE_LIMIT_TIERS } from "@/lib/security/rate-limiter"
import { createClient as updateSupabaseSession } from "@/utils/supabase/middleware"

type Role = "SUPER_ADMIN" | "OWNER" | "CUSTOMER"

// Define route access rules
const routeAccessRules: Record<string, Role[]> = {
  // Public routes
  "/register": [],
  "/api/auth": [],
  "/api/health": [],
  "/api/parking": [], // Allow public access to parking API
  
  // Customer routes (default dashboard - accessible by all authenticated users)
  "/dashboard": ["CUSTOMER", "OWNER", "SUPER_ADMIN"],
  "/api/bookings": ["CUSTOMER", "OWNER", "SUPER_ADMIN"],
  
  // Owner routes
  "/dashboard/owner": ["OWNER", "SUPER_ADMIN"],
  "/api/owner": ["OWNER", "SUPER_ADMIN"],
  
  // Super Admin routes (strict)
  "/dashboard/admin": ["SUPER_ADMIN"],
  "/api/admin": ["SUPER_ADMIN"],
  "/api/audit-logs": ["SUPER_ADMIN"],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Refresh Supabase session cookies
  const supabaseResponse = updateSupabaseSession(req)
  
  // Allow public routes
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/todos") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  ) {
    return supabaseResponse
  }
  
  // Allow /api/health to bypass rate limiting and auth
  if (pathname.startsWith("/api/health")) {
    return NextResponse.next()
  }
  
  // Apply rate limiting to API routes
  if (pathname.startsWith("/api")) {
    // Determine rate limit tier based on route
    let tier: keyof typeof RATE_LIMIT_TIERS = "PUBLIC"
    
    if (pathname.startsWith("/api/auth")) {
      tier = "AUTH"
    } else if (pathname.startsWith("/api/bookings") || pathname.startsWith("/api/payment")) {
      tier = "BOOKING_PAYMENT"
    } else if (pathname.startsWith("/api/admin")) {
      tier = "ADMIN"
    } else if (pathname.startsWith("/api/hardware")) {
      tier = "HARDWARE_WEBHOOK"
    }
    
    // Apply rate limiting
    const rateLimitResult = applyRateLimit(req, tier)
    
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { error: rateLimitResult.error?.message },
        { status: rateLimitResult.error?.status || 429 }
      )
      
      // Add rate limit headers
      Object.entries(rateLimitResult.headers || {}).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
      
      return response
    }
    
    // Add rate limit headers to successful responses
    const response = NextResponse.next()
    Object.entries(rateLimitResult.headers || {}).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    
    // Allow /api/auth and /api/parking to pass through
    if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/parking")) {
      return response
    }
  }
  
  // Get token from request
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  
  console.log("🔐 Middleware Token Check:", { 
    pathname, 
    hasToken: !!token, 
    role: token?.role,
    email: token?.email 
  })
  
  // If no token, only redirect for protected routes (not home page)
  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    // Only redirect if trying to access protected routes
    if (pathname.startsWith("/dashboard")) {
      console.log("🔐 Middleware: No token, redirecting to login")
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return NextResponse.next()
  }
  
  // Check role-based access (only if token exists)
  const userRole = token.role as Role
  console.log("🔐 Middleware: User role:", userRole)
  
  // Find matching route rule
  const matchingRoute = Object.keys(routeAccessRules).find((route) =>
    pathname.startsWith(route)
  )
  
  console.log("🔐 Middleware Route Check:", { 
    pathname, 
    matchingRoute, 
    userRole,
    allowedRoles: matchingRoute ? routeAccessRules[matchingRoute] : null 
  })
  
  if (matchingRoute) {
    const allowedRoles = routeAccessRules[matchingRoute]
    
    // If route requires specific roles
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      console.log("🔐 Middleware: Access denied - insufficient permissions")
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Forbidden - Insufficient permissions" },
          { status: 403 }
        )
      }
      return NextResponse.redirect(new URL("/403", req.url))
    }
  }
  
  console.log("🔐 Middleware: Access granted")
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}