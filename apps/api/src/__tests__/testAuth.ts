import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "@prompter/db";
import type { TenantContext } from "../middleware/tenantScope.js";

/**
 * Test-only replacement for the real tenantScope middleware. Bypasses Clerk
 * entirely -- faking Clerk's internal AuthObject shape well enough for
 * getAuth() to accept it proved too fragile (it's validated by Clerk's own
 * backend SDK internals, not just a plain object shape). Injecting req.tenant
 * directly exercises the same route logic without that dependency.
 *
 * Still mirrors the org-suspended read-only rule from the real tenantScope
 * (state-machines.md edge case) -- otherwise tests can't prove that behavior
 * without a real Clerk session.
 */
export function fakeTenantScope(tenant: TenantContext | null): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!tenant) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    if (req.method !== "GET") {
      const org = await prisma.org.findUnique({ where: { id: tenant.orgId } });
      if (org?.status === "suspended") {
        res.status(423).json({ error: "org_suspended" });
        return;
      }
    }

    req.tenant = tenant;
    next();
  };
}
