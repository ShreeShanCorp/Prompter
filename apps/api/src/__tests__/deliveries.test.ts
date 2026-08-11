/**
 * Integration test against the live local Postgres proving the delivery
 * hard gate ("Exported -> Delivered requires >=1 successful Export") and the
 * tuned-per-tool copy output from docs/architecture/state-machines.md and
 * Section 5 must-have #6.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeTenantScope } from "./testAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../packages/db/.env") });

const { prisma, withTenantContext } = await import("@prompter/db");
const { createProjectsRouter } = await import("../routes/projects.js");
const { LocalExportStorage } = await import("../lib/exportStorage.js");
const express = (await import("express")).default;

const REQUIRED_SECTIONS_FILLED = {
  sectionIdentity: { productName: "Prompter" },
  sectionRoles: [{ role: "Member" }],
  sectionDomainModel: { entities: "Org 1---* Project" },
  sectionTechStack: [{ layer: "Frontend", choice: "React 19" }],
  sectionMvpScope: ["Auth"],
  sectionNfr: { security: "OWASP top 10" },
  sectionIntegrations: [{ service: "Clerk", purpose: "auth" }],
  sectionUiUx: { reference: "Linear" },
  sectionDeliverables: { formats: ["md"] },
};

const TEST_EXPORT_DIR = path.resolve(__dirname, "../../.local-exports-test-deliveries");

async function seedProject() {
  const org = await prisma.org.create({
    data: {
      name: "Delivery Test Org",
      slug: `delivery-test-org-${Date.now()}`,
      clerkOrgId: `clerk_org_delivery_${Date.now()}`,
    },
  });
  const member = await prisma.member.create({
    data: { clerkUserId: `clerk_user_delivery_${Date.now()}`, email: "delivery@example.com" },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    }),
  );

  const app = express();
  app.use(express.json());
  app.use(
    createProjectsRouter(
      fakeTenantScope({ orgId: org.id, memberId: member.id, role: "owner", isPlatformAdmin: false }),
      new LocalExportStorage(TEST_EXPORT_DIR),
    ),
  );

  const created = await request(app).post("/projects").send({ name: "Delivery Target" });
  return { org, member, app, projectId: created.body.id as string };
}

describe("delivery ('copy for tool')", () => {
  let ctx: Awaited<ReturnType<typeof seedProject>>;

  beforeAll(async () => {
    ctx = await seedProject();
  });

  afterAll(async () => {
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.deliveryRecord.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.walletTransaction.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.export.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.wallet.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.templateResponse.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.project.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.orgMembership.deleteMany({}));
    await prisma.member.deleteMany({ where: { id: ctx.member.id } });
    await prisma.org.deleteMany({ where: { id: ctx.org.id } });
    await prisma.$disconnect();
    const { rm } = await import("node:fs/promises");
    await rm(TEST_EXPORT_DIR, { recursive: true, force: true });
  });

  it("blocks delivery before any export exists", async () => {
    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/deliveries`)
      .send({ targetTool: "claude_code", method: "copy" });
    expect(res.status).toBe(409);
  });

  it("rejects an unsupported delivery method (api/mcp are v2)", async () => {
    await request(ctx.app).patch(`/projects/${ctx.projectId}/template`).send(REQUIRED_SECTIONS_FILLED);
    await request(ctx.app).post(`/projects/${ctx.projectId}/exports`).send({ format: "md" });

    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/deliveries`)
      .send({ targetTool: "claude_code", method: "api" });
    expect(res.status).toBe(400);
  });

  it("delivers via copy once exported, returning Claude Code content verbatim", async () => {
    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/deliveries`)
      .send({ targetTool: "claude_code", method: "copy" });

    expect(res.status).toBe(201);
    expect(res.body.delivery.targetTool).toBe("claude_code");
    expect(res.body.delivery.method).toBe("copy");
    expect(res.body.delivery.status).toBe("success");
    expect(res.body.project.status).toBe("delivered");
    expect(res.body.content).toContain("Delivery Target");
    // Claude Code gets the raw content, no adaptation preamble.
    expect(res.body.content.startsWith("# Delivery Target")).toBe(true);
  });

  it("tunes the output differently per tool", async () => {
    const codex = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/deliveries`)
      .send({ targetTool: "codex", method: "copy" });
    expect(codex.status).toBe(201);
    expect(codex.body.content).toContain("You are Codex");

    const other = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/deliveries`)
      .send({ targetTool: "other", method: "copy" });
    expect(other.status).toBe(201);
    expect(other.body.content).not.toContain("You are Codex");
  });

  it("lists delivery history newest first", async () => {
    const res = await request(ctx.app).get(`/projects/${ctx.projectId}/deliveries`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    expect(res.body[0].targetTool).toBe("other");
  });
});
