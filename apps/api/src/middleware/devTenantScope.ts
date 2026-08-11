import type { NextFunction, Request, Response } from "express";
import { prisma, withTenantContext } from "@prompter/db";
import type { TenantContext } from "./tenantScope.js";

const DEV_CLERK_ORG_ID = "dev_org_demo";
const DEV_CLERK_USER_ID = "dev_user_demo";

let cachedContext: TenantContext | null = null;

/**
 * Creates (once) or reuses a single demo Org+Member+OrgMembership, entirely
 * bypassing Clerk. Only wired up by createApp() when NODE_ENV !== "production"
 * AND CLERK_SECRET_KEY is unset (see app.ts) -- exists purely so the frontend
 * has something to authenticate against before real Clerk keys are available.
 * Never used once real keys are configured.
 */
async function ensureDevTenant(): Promise<TenantContext> {
  if (cachedContext) return cachedContext;

  const org = await prisma.org.upsert({
    where: { clerkOrgId: DEV_CLERK_ORG_ID },
    update: {},
    create: { name: "Dev Demo Org", slug: "dev-demo-org", clerkOrgId: DEV_CLERK_ORG_ID },
  });
  const member = await prisma.member.upsert({
    where: { clerkUserId: DEV_CLERK_USER_ID },
    update: {},
    create: { clerkUserId: DEV_CLERK_USER_ID, email: "dev@example.com", name: "Dev User" },
  });
  const membership = await withTenantContext(prisma, org.id, async (tx) => {
    const existing = await tx.orgMembership.findFirst({ where: { memberId: member.id } });
    if (existing) return existing;
    return tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    });
  });

  cachedContext = {
    orgId: org.id,
    memberId: member.id,
    role: membership.role,
    isPlatformAdmin: false,
  };
  return cachedContext;
}

export async function devTenantScope(req: Request, _res: Response, next: NextFunction) {
  req.tenant = await ensureDevTenant();
  next();
}
