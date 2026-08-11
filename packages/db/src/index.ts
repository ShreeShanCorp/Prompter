import { PrismaClient } from "../generated/client/index.js";

export const prisma = new PrismaClient();

let systemPrismaSingleton: PrismaClient | null = null;

/**
 * Connects as platform_admin_role (BYPASSRLS) -- for genuinely
 * system-initiated operations with no user session to scope tenant RLS
 * from (e.g. a payment webhook looking up a CreditPurchase before it knows
 * which org it belongs to). Never use this for anything reachable from a
 * user-facing request; those must go through the normal `prisma` client +
 * withTenantContext. Returns null if SYSTEM_DATABASE_URL isn't configured.
 */
export function getSystemPrisma(): PrismaClient | null {
  if (systemPrismaSingleton) return systemPrismaSingleton;
  const url = process.env.SYSTEM_DATABASE_URL;
  if (!url) return null;
  systemPrismaSingleton = new PrismaClient({ datasourceUrl: url });
  return systemPrismaSingleton;
}

export * from "../generated/client/index.js";
export * from "./tenant.js";
