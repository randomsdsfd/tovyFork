import {
  PrismaClient,
  role,
  workspace,
  user,
  Session,
  SessionType,
  schedule,
  ActivitySession,
  document,
  wallPost,
  inactivityNotice,
  sessionUser,
  Quota,
  Ally,
  allyVisit,
} from "@prisma/client";

// Prevent multiple Prisma instances in dev (Next.js hot-reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// Only attach to global in development (for hot reload safety)
if (process.env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}

export type {
  role,
  workspace,
  user,
  Session,
  SessionType,
  schedule,
  ActivitySession,
  document,
  wallPost,
  inactivityNotice,
  sessionUser,
  Quota,
  Ally,
  allyVisit,
};

export default prisma;