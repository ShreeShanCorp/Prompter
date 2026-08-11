/**
 * Integration test against the live local Postgres proving the export
 * hard gate and the wallet/credit resolution order from
 * docs/architecture/state-machines.md ("Wallet / Credit lifecycle").
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeTenantScope } from "./testAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../packages/db/.env") });

const { prisma, withTenantContext } = await import("@prompter/db");
const { createProjectsRouter } = await import("../routes/projects.js");
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

const TEST_EXPORT_DIR = path.resolve(__dirname, "../../.local-exports-test");

async function seedReadyProject(orgLabel: string) {
  const org = await prisma.org.create({
    data: {
      name: `Export Test Org ${orgLabel}`,
      slug: `export-test-org-${orgLabel}-${Date.now()}`,
      clerkOrgId: `clerk_org_export_${orgLabel}_${Date.now()}`,
    },
  });
  const member = await prisma.member.create({
    data: {
      clerkUserId: `clerk_user_export_${orgLabel}_${Date.now()}`,
      email: `${orgLabel}@example.com`,
    },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    }),
  );

  const app = express();
  app.use(express.json());
  const { LocalExportStorage } = await import("../lib/exportStorage.js");
  app.use(
    createProjectsRouter(
      fakeTenantScope({ orgId: org.id, memberId: member.id, role: "owner", isPlatformAdmin: false }),
      new LocalExportStorage(TEST_EXPORT_DIR),
    ),
  );

  const created = await request(app).post("/projects").send({ name: "Export Target" });
  const projectId = created.body.id as string;

  return { org, member, app, projectId };
}

describe("export generation and wallet credits", () => {
  let ctx: Awaited<ReturnType<typeof seedReadyProject>>;

  beforeAll(async () => {
    ctx = await seedReadyProject("x");
  });

  afterAll(async () => {
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.walletTransaction.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.export.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.wallet.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.templateResponse.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.project.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.orgMembership.deleteMany({}));
    await prisma.member.deleteMany({ where: { id: ctx.member.id } });
    await prisma.org.deleteMany({ where: { id: ctx.org.id } });
    await prisma.$disconnect();
    await rm(TEST_EXPORT_DIR, { recursive: true, force: true });
  });

  it("blocks export while the project is still Draft/InProgress", async () => {
    const res = await request(ctx.app).post(`/projects/${ctx.projectId}/exports`).send({ format: "md" });
    expect(res.status).toBe(409);
  });

  it("consumes the free hourly credit on the first export once ReadyToExport", async () => {
    await request(ctx.app)
      .patch(`/projects/${ctx.projectId}/template`)
      .send(REQUIRED_SECTIONS_FILLED);

    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/exports`)
      .send({ format: "md" });

    expect(res.status).toBe(201);
    expect(res.body.export.creditSource).toBe("free_hourly");
    expect(res.body.export.version).toBe(1);
    expect(res.body.project.status).toBe("exported");

    const wallet = await request(ctx.app).get("/wallet");
    expect(wallet.body.balance).toBe(0);
  });

  it("downloads the generated file with the correct content type", async () => {
    const list = await request(ctx.app).get(`/projects/${ctx.projectId}/exports`);
    const exportId = list.body[0].id as string;

    const res = await request(ctx.app).get(`/projects/${ctx.projectId}/exports/${exportId}/download`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toContain("Export Target");
  });

  it("blocks a second export within the same hour once free entitlement and balance are both exhausted", async () => {
    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/exports`)
      .send({ format: "md" });
    expect(res.status).toBe(402);
  });

  it("falls back to the purchased balance once credited, and debits it", async () => {
    await withTenantContext(prisma, ctx.org.id, (tx) =>
      tx.wallet.update({ where: { orgId: ctx.org.id }, data: { balance: 2 } }),
    );

    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/exports`)
      .send({ format: "md" });

    expect(res.status).toBe(201);
    expect(res.body.export.creditSource).toBe("purchased");
    expect(res.body.export.version).toBe(2);

    const wallet = await request(ctx.app).get("/wallet");
    expect(wallet.body.balance).toBe(1);
  });

  it("lists export history ordered newest first", async () => {
    const res = await request(ctx.app).get(`/projects/${ctx.projectId}/exports`);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { version: number }) => e.version)).toEqual([2, 1]);
  });

  it("generates a .docx export as a real zip-format file", async () => {
    await withTenantContext(prisma, ctx.org.id, (tx) =>
      tx.wallet.update({ where: { orgId: ctx.org.id }, data: { balance: 1 } }),
    );

    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/exports`)
      .send({ format: "docx" });

    expect(res.status).toBe(201);
    expect(res.body.export.format).toBe("docx");

    const filePath = (res.body.export.fileUrl as string).replace("file://", "");
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(filePath);
    // .docx files are zip archives -- "PK" magic bytes at the start.
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it(
    "generates a .pdf export as a real PDF file",
    async () => {
      await withTenantContext(prisma, ctx.org.id, (tx) =>
        tx.wallet.update({ where: { orgId: ctx.org.id }, data: { balance: 1 } }),
      );

      const res = await request(ctx.app)
        .post(`/projects/${ctx.projectId}/exports`)
        .send({ format: "pdf" });

      expect(res.status).toBe(201);
      expect(res.body.export.format).toBe("pdf");

      const filePath = (res.body.export.fileUrl as string).replace("file://", "");
      const { readFile } = await import("node:fs/promises");
      const bytes = await readFile(filePath);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    },
    20_000,
  );

  it("rejects an unsupported format", async () => {
    const res = await request(ctx.app)
      .post(`/projects/${ctx.projectId}/exports`)
      .send({ format: "txt" });
    expect(res.status).toBe(400);
  });
});
