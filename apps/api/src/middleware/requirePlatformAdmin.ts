import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "@prompter/db";

/**
 * Platform-admin gate for routes with no org context (e.g. the admin panel's
 * cross-org user/org list). This only checks Member.platformRole -- it does
 * NOT grant data access by itself. Any route that reads a specific org's
 * content on top of this must go through the audited bypass path
 * (platform_admin_role + admin_access_log), wired up in the Stage E/G admin
 * panel work, not here.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const member = await prisma.member.findUnique({ where: { clerkUserId: auth.userId } });
  if (!member || member.platformRole !== "platform_admin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  next();
}
