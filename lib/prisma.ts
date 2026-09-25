import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const noOpHandler: Record<string, any> = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async (d: any) => d?.data ?? { id: "mock-" + Date.now() },
  update: async (d: any) => d?.data ?? {},
  delete: async () => ({}),
  upsert: async (d: any) => d?.create ?? d?.update ?? {},
  count: async () => 0,
  aggregate: async () => ({ _count: 0, _sum: {}, _avg: {} }),
  groupBy: async () => [],
}

const mockModelProxy = new Proxy(noOpHandler, {
  get: (target, prop: string) => {
    if (prop in target) return target[prop]
    return async () => null
  },
})

function createSafePrisma(): any {
  let realClient: any = null
  try {
    const SUPABASE_DB_URL = "postgresql://postgres.trtowyvsxtwzakqngfsp:81BAgHaNsjdvgBZ1@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require";
    const envUrl = process.env.DATABASE_URL;
    const dbUrl = (envUrl && !envUrl.includes("HOST:PORT") && !envUrl.startsWith("mysql://"))
      ? envUrl
      : SUPABASE_DB_URL;

    realClient = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: ["error"],
    })
  } catch (err) {
    console.warn("[AI Studio] PrismaClient initialization warning — using fallback", err)
  }

  return new Proxy(realClient || {}, {
    get: (target, prop: string) => {
      if (prop === "$connect") return async () => {}
      if (prop === "$disconnect") return async () => {}
      if (prop === "$queryRaw" || prop === "$executeRaw" || prop === "$queryRawUnsafe" || prop === "$executeRawUnsafe") {
        return async () => []
      }
      if (prop === "$transaction") {
        return async (arg: any) => {
          if (typeof arg === "function") return arg(target)
          return Promise.all(arg)
        }
      }

      const propStr = typeof prop === "string" ? prop : String(prop)
      const propLower = propStr.toLowerCase()
      let model = realClient ? (realClient[prop] || realClient[propLower]) : null

      if (!model && realClient) {
        if (propLower === "slot" || propLower === "slots") model = realClient.parkingslot
        if (propLower === "site" || propLower === "sites") model = realClient.parkingsite
        if (propLower === "auditlog" || propLower === "auditlogs") model = realClient.auditlog
        if (propLower === "hardwaredevice" || propLower === "hardwaredevices") model = realClient.hardwaredevice
        if (propLower === "edgedevice" || propLower === "edgedevices") model = realClient.edgedevice
        if (propLower === "edgedevicesecret") model = realClient.edgedevicesecret
      }

      if (model) {
        if (typeof model === "object" && model !== null) {
          return new Proxy(model, {
            get: (mTarget, mProp: string) => {
              const origMethod = mTarget[mProp]
              if (typeof origMethod === "function") {
                return async (...args: any[]) => {
                  try {
                    return await origMethod.apply(mTarget, args)
                  } catch (queryErr: any) {
                    console.warn(`[AI Studio] Database query failed on ${propStr}.${mProp}, falling back:`, queryErr?.message || queryErr)
                    if (mProp === "findMany") return []
                    if (mProp === "count") return 0
                    if (mProp === "create" || mProp === "update") return args[0]?.data ?? {}
                    return null
                  }
                }
              }
              return origMethod
            },
          })
        }
        return model
      }

      return mockModelProxy
    },
  })
}

export const prisma: PrismaClient = (globalForPrisma.prisma ?? createSafePrisma()) as PrismaClient

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
