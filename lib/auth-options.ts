import NextAuth from "next-auth"
import { DefaultSession } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { logLogin, logFailedLogin } from "@/lib/audit"

// Define types for session and token augmentation
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      email: string
      name?: string | null
      parkingLotId?: string
    } & DefaultSession["user"]
  }
  interface User {
    id: string
    role: string
    email: string
    name?: string | null
    parkingLotId?: string
    ownerprofile?: {
      parkinglot: Array<{ id: string }>
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
    email: string
    name?: string | null
    parkingLotId?: string
  }
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        try {
          console.log("🔴 AUTHORIZE CALLED")

          if (!credentials?.email || !credentials?.password) {
            console.log("❌ Missing credentials")
            return null
          }

          const email = credentials.email
          const password = credentials.password

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              role: true,
              ownerprofile: {
                select: {
                  parkinglot: {
                    select: {
                      id: true
                    },
                    take: 1
                  }
                }
              }
            }
          })

          if (!user) {
            console.log("❌ User not found in DB")
            await logFailedLogin(email)
            return null
          }

          console.log("🔴 USER FOUND:", user.email, "ROLE:", user.role)

          if (!user.passwordHash) {
            console.log("❌ No password hash found")
            await logFailedLogin(email)
            return null
          }

          const isValidPassword = await bcrypt.compare(password, user.passwordHash)
          if (!isValidPassword) {
            console.log("❌ Password mismatch")
            await logFailedLogin(email)
            return null
          }

          console.log("✅ AUTH SUCCESS - RETURNING USER")
          await logLogin(user.id)

          const parkingLotId = user.ownerprofile?.parkinglot[0]?.id

          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email,
            role: user.role,
            parkingLotId: parkingLotId
          }

        } catch (error) {
          console.error("🔴 AUTH ERROR:", error)
          return null
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  session: {
    strategy: "jwt" as const,
    maxAge: 60 * 60 * 24, // default 1 day
  },

  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        console.log("🔑 JWT Callback - Setting token from user:", { 
          userId: user.id, 
          role: user.role, 
          email: user.email 
        })
        token.id = user.id
        token.role = user.role
        token.email = user.email
        token.name = user.name
        token.parkingLotId = user.parkingLotId
      }
      console.log("🔑 JWT Callback - Token:", { 
        id: token.id, 
        role: token.role, 
        email: token.email 
      })
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        console.log("🔐 Session Callback - Setting session from token:", { 
          tokenId: token.id, 
          tokenRole: token.role, 
          tokenEmail: token.email 
        })
        session.user.id = token.id
        session.user.role = token.role
        session.user.email = token.email
        session.user.name = token.name
        session.user.parkingLotId = token.parkingLotId
      }
      console.log("🔐 Session Callback - Final session:", { 
        userId: session.user?.id, 
        userRole: session.user?.role, 
        userEmail: session.user?.email 
      })
      return session
    },
     async redirect({ url, baseUrl, token }: any) {
      console.log("🔀 Redirect Callback:", { url, baseUrl, tokenRole: token?.role })

      // Role-based redirect ALWAYS takes priority after successful authentication
      if (token?.role) {
        if (token.role === "SUPER_ADMIN") {
          console.log("🔀 Redirecting SUPER_ADMIN to /dashboard/admin")
          return `${baseUrl}/dashboard/admin`
        }
        if (token.role === "OWNER") {
          console.log("🔀 Redirecting OWNER to /dashboard/owner")
          return `${baseUrl}/dashboard/owner`
        }
      }

      // Fall back to requested URL only for unauthenticated flows (e.g., sign-out)
      if (url && url !== baseUrl) {
        console.log("🔀 Using requested URL:", url)
        return url
      }
      
      // Default for CUSTOMER and others
      console.log("🔀 Redirecting to /dashboard (default)")
      return `${baseUrl}/dashboard`
    },
  },

  pages: {
    signIn: "/",
    error: "/",
  },

  secret: process.env.NEXTAUTH_SECRET || "super-secret-jwt-key-change-in-production-123456789",
}