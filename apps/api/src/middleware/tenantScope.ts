import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { prisma, withTenantContext, type MembershipRole, type Member, type Org } from "@prompter/db";

export interface TenantContext {
  orgId: string;
  memberId: string;
  role: MembershipRole;
  isPlatformAdmin: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    tenant?: TenantContext;
  }
}

function mapClerkOrgRole(orgRole: string | null | undefined): MembershipRole {
  return orgRole?.includes("admin") ? "owner" : "member";
}

/**
 * Just-in-time provisioning: the first time we see a given Clerk user/org
 * pair, create the corresponding Member/Org/OrgMembership rows by fetching
 * details from Clerk's backend API. There's no webhook wired up yet (would
 * need a public URL for local dev) -- this sync-on-request approach covers
 * the same need without that infrastructure. Revisit with real webhooks if
 * provisioning latency or missed-event edge cases become a problem.
 */
async function ensureMember(clerkUserId: string): Promise<Member> {
  const existing = await prisma.member.findUnique({ where: { clerkUserId } });
  if (existing) return existing;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error(`Clerk user ${clerkUserId} has no email address`);
  }

  return prisma.member.create({
    data: {
      clerkUserId,
      email,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
    },
  });
}

async function ensureOrg(clerkOrgId: string): Promise<Org> {
  const existing = await prisma.org.findUnique({ where: { clerkOrgId } });
  if (existing) return existing;

  const clerkOrg = await clerkClient.organizations.getOrganization({ organizationId: clerkOrgId });
  return prisma.org.create({
    data: { clerkOrgId, name: clerkOrg.name, slug: clerkOrg.slug ?? clerkOrgId },
  });
}

async function ensureMembership(orgId: string, memberId: string, role: MembershipRole) {
  const existing = await withTenantContext(prisma, orgId, (tx) =>
    tx.orgMembership.findFirst({ where: { memberId } }),
  );
  if (existing) return existing;

  return withTenantContext(prisma, orgId, (tx) =>
    tx.orgMembership.create({ data: { orgId, memberId, role, status: "active" } }),
  );
}

/**
 * Resolves the Clerk session into { orgId, memberId, role } and attaches it
 * to req.tenant. Runs after Clerk's own auth middleware, before any route
 * handler that touches tenant-scoped data. See docs/architecture/multi-tenancy.md.
 */
export async function tenantScope(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);

  if (!auth.userId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  if (!auth.orgId) {
    res.status(403).json({ error: "no_active_org" });
    return;
  }

  const member = await ensureMember(auth.userId);
  const org = await ensureOrg(auth.orgId);
  const membership = await ensureMembership(org.id, member.id, mapClerkOrgRole(auth.orgRole));

  if (membership.status !== "active") {
    res.status(403).json({ error: "not_a_member" });
    return;
  }

  req.tenant = {
    orgId: org.id,
    memberId: member.id,
    role: membership.role,
    isPlatformAdmin: member.platformRole === "platform_admin",
  };
  next();
}

export function requireRole(...roles: MembershipRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (!roles.includes(req.tenant.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
