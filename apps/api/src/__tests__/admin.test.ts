/**
 * Integration test against the live local Postgres proving the admin panel
 * (Section 5 must-have #8): org list with usage stats, suspend/reactivate
 * (and that suspension actually makes the org read-only, per the edge case
 * in state-machines.md), and the product-name rename-point config.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { fakeTenantScope } from "./testAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../packages/db/.env") });

const { prisma, withTenantContext, getSystemPrisma } = await import("@prompter/db");
const { createProjectsRouter } = await import("../routes/projects.js");
const { createAdminRouter } = await import("../routes/admin.js");
const express = (await import("express")).default;

function allowAll(_req: Request, _res: Response, next: NextFunction) {
  next();
}
function denyAll(_req: Request, res: Response) {
  res.status(403).json({ error: "forbidden" });
}

async function seedOrgWithMember() {
  const org = await prisma.org.create({
    data: {
      name: "Admin Test Org",
      slug: `admin-test-org-${Date.now()}`,
      clerkOrgId: `clerk_org_admin_${Date.now()}`,
    },
  });
  const member = await prisma.member.create({
    data: { clerkUserId: `clerk_user_admin_${Date.now()}`, email: "admin-test@example.com" },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    }),
  );

  const orgApp = express();
  orgApp.use(express.json());
  orgApp.use(
    createProjectsRouter(
      fakeTenantScope({ orgId: org.id, memberId: member.id, role: "owner", isPlatformAdmin: false }),
    ),
  );

  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use(createAdminRouter(allowAll));

  const nonAdminApp = express();
  nonAdminApp.use(express.json());
  nonAdminApp.use(createAdminRouter(denyAll));

  return { org, member, orgApp, adminApp, nonAdminApp };
}

describe("admin panel", () => {
  let ctx: Awaited<ReturnType<typeof seedOrgWithMember>>;

  beforeAll(async () => {
    ctx = await seedOrgWithMember();
  });

  afterAll(async () => {
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.templateResponse.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.project.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.orgMembership.deleteMany({}));
    await prisma.member.deleteMany({ where: { id: ctx.member.id } });
    await prisma.org.deleteMany({ where: { id: ctx.org.id } });
    await prisma.$disconnect();
    await getSystemPrisma()?.$disconnect();
  });

  it("rejects non-admins", async () => {
    const res = await request(ctx.nonAdminApp).get("/admin/orgs");
    expect(res.status).toBe(403);
  });

  it("lists orgs with usage stats", async () => {
    await request(ctx.orgApp).post("/projects").send({ name: "Admin-visible project" });

    const res = await request(ctx.adminApp).get("/admin/orgs");
    expect(res.status).toBe(200);
    const row = res.body.find((o: { id: string }) => o.id === ctx.org.id);
    expect(row).toBeTruthy();
    expect(row.memberCount).toBe(1);
    expect(row.projectCount).toBe(1);
    expect(row.status).toBe("active");
  });

  it("suspending an org makes it read-only for its own members", async () => {
    const suspend = await request(ctx.adminApp).post(`/admin/orgs/${ctx.org.id}/suspend`);
    expect(suspend.status).toBe(200);
    expect(suspend.body.status).toBe("suspended");

    // Reads still work.
    const read = await request(ctx.orgApp).get("/projects");
    expect(read.status).toBe(200);

    // Writes are blocked.
    const write = await request(ctx.orgApp).post("/projects").send({ name: "Should be blocked" });
    expect(write.status).toBe(423);
  });

  it("reactivating restores write access", async () => {
    const reactivate = await request(ctx.adminApp).post(`/admin/orgs/${ctx.org.id}/reactivate`);
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe("active");

    const write = await request(ctx.orgApp).post("/projects").send({ name: "Allowed again" });
    expect(write.status).toBe(201);
  });

  it("reads and updates the product-name rename-point config", async () => {
    const initial = await request(ctx.adminApp).get("/admin/platform-settings/product-name");
    expect(initial.status).toBe(200);
    expect(initial.body.value).toBe("Prompter");

    const updated = await request(ctx.adminApp)
      .put("/admin/platform-settings/product-name")
      .send({ value: "Prompter Renamed" });
    expect(updated.status).toBe(200);
    expect(updated.body.value).toBe("Prompter Renamed");

    const readBack = await request(ctx.adminApp).get("/admin/platform-settings/product-name");
    expect(readBack.body.value).toBe("Prompter Renamed");

    // Restore, so other tests / manual runs see the original name.
    await request(ctx.adminApp)
      .put("/admin/platform-settings/product-name")
      .send({ value: "Prompter" });
  });
});
