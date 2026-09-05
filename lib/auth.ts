import { getServerSession } from "next-auth"
import bcrypt from "bcryptjs"
import { prisma } from "./prisma"
import { authOptions } from "./auth-options"

type Role = "SUPER_ADMIN" | "CUSTOMER" | "OWNER"

/**
 * Get current authentication session
 */
export async function getAuthSession() {
  return await getServerSession(authOptions)
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

/**
 * Require specific role for access
 * Throws 403 error if user doesn't have required role
 */
export async function requireRole(allowedRoles: Role[]): Promise<void> {
  const session = await getAuthSession()
  
  if (!session || !session.user) {
    throw new Error("UNAUTHORIZED")
  }
  
  const userRole = session.user.role as Role
  
  if (!allowedRoles.includes(userRole)) {
    throw new Error("FORBIDDEN")
  }
}

/**
 * Check if user has specific role
 */
export async function hasRole(role: Role): Promise<boolean> {
  const session = await getAuthSession()
  
  if (!session || !session.user) {
    return false
  }
  
  return session.user.role === role
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(roles: Role[]): Promise<boolean> {
  const session = await getAuthSession()
  
  if (!session || !session.user) {
    return false
  }
  
  return roles.includes(session.user.role as Role)
}

/**
 * Get current user from session
 */
export async function getCurrentUser() {
  const session = await getAuthSession()
  
  if (!session || !session.user) {
    return null
  }
  
  return session.user
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getAuthSession()
  return !!session && !!session.user
}

/**
 * Get user from session (for use in API routes)
 */
export async function getUserFromSession() {
  const session = await getAuthSession()
  
  if (!session || !session.user) {
    return null
  }
  
  return session.user
}