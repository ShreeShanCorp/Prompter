import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { TenantContext } from "../middleware/tenantScope.js";

/**
 * Test-only replacement for the real tenantScope middleware. Bypasses Clerk
 * entirely -- faking Clerk's internal AuthObject shape well enough for
 * getAuth() to accept it proved too fragile (it's validated by Clerk's own
 * backend SDK internals, not just a plain object shape). Injecting req.tenant
 * directly exercises the same route logic without that dependency.
 */
export function fakeTenantScope(tenant: TenantContext | null): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!tenant) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    req.tenant = tenant;
    next();
  };
}
