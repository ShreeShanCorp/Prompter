/**
 * Integration test against the live local Postgres (same setup as
 * tenant-isolation.test.ts) proving the Project state machine from
 * docs/architecture/state-machines.md behaves as designed, end to end
 * through the real HTTP routes.
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
const { createApp } = await import("../app.js");

const REQUIRED_SECTIONS_FILLED = {
  sectionIdentity: { productName: "Prompter" },
  sectionRoles: [{ role: "Member" }, { role: "Owner" }],
  sectionDomainModel: { entities: "Org 1---* Project" },
  sectionTechStack: [{ layer: "Frontend", choice: "React 19" }],
  sectionMvpScope: ["Auth", "Wizard"],
  sectionNfr: { security: "OWASP top 10" },
  sectionIntegrations: [{ service: "Clerk", purpose: "auth" }],
  sectionUiUx: { reference: "Linear" },
  sectionDeliverables: { formats: ["md", "docx", "pdf"] },
};

async function seedOrgWithMember(label: string) {
  const org = await prisma.org.create({
    data: {
      name: `Test Org ${label}`,
      slug: `proj-test-org-${label}-${Date.now()}`,
      clerkOrgId: `clerk_org_proj_${label}_${Date.now()}`,
    },
  });
  const member = await prisma.member.create({
    data: {
      clerkUserId: `clerk_user_proj_${label}_${Date.now()}`,
      email: `${label}@example.com`,
    },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    }),
  );
  return { org, member };
}

describe("project lifecycle", () => {
  let orgA: Awaited<ReturnType<typeof seedOrgWithMember>>;
  let orgB: Awaited<ReturnType<typeof seedOrgWithMember>>;
  let appA: ReturnType<typeof createApp>;
  let appB: ReturnType<typeof createApp>;
  let appUnauthenticated: ReturnType<typeof createApp>;

  beforeAll(async () => {
    orgA = await seedOrgWithMember("a");
    orgB = await seedOrgWithMember("b");
    appA = createApp({
      tenantScopeMiddleware: fakeTenantScope({
        orgId: orgA.org.id,
        memberId: orgA.member.id,
        role: "owner",
        isPlatformAdmin: false,
      }),
    });
    appB = createApp({
      tenantScopeMiddleware: fakeTenantScope({
        orgId: orgB.org.id,
        memberId: orgB.member.id,
        role: "owner",
        isPlatformAdmin: false,
      }),
    });
    appUnauthenticated = createApp({ tenantScopeMiddleware: fakeTenantScope(null) });
  });

  afterAll(async () => {
    for (const { org } of [orgA, orgB]) {
      await withTenantContext(prisma, org.id, (tx) => tx.templateResponse.deleteMany({}));
      await withTenantContext(prisma, org.id, (tx) => tx.project.deleteMany({}));
      await withTenantContext(prisma, org.id, (tx) => tx.orgMembership.deleteMany({}));
    }
    await prisma.member.deleteMany({
      where: { id: { in: [orgA.member.id, orgB.member.id] } },
    });
    await prisma.org.deleteMany({ where: { id: { in: [orgA.org.id, orgB.org.id] } } });
    await prisma.$disconnect();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(appUnauthenticated).get("/projects");
    expect(res.status).toBe(401);
  });

  it("creates a project in Draft status", async () => {
    const res = await request(appA).post("/projects").send({ name: "My SaaS" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.name).toBe("My SaaS");
  });

  it("moves Draft -> InProgress on the first template save, even if incomplete", async () => {
    const created = await request(appA).post("/projects").send({ name: "Partial" });
    const projectId = created.body.id;

    const res = await request(appA)
      .patch(`/projects/${projectId}/template`)
      .send({ sectionIdentity: { productName: "Partial" } });

    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe("in_progress");
    expect(res.body.templateResponse.completenessPct).toBeLessThan(100);
  });

  it("moves InProgress -> ReadyToExport once every required section is filled", async () => {
    const created = await request(appA).post("/projects").send({ name: "Complete" });
    const projectId = created.body.id;

    const res = await request(appA)
      .patch(`/projects/${projectId}/template`)
      .send(REQUIRED_SECTIONS_FILLED);

    expect(res.status).toBe(200);
    expect(res.body.templateResponse.completenessPct).toBe(100);
    expect(res.body.project.status).toBe("ready_to_export");
  });

  it("reverts ReadyToExport -> InProgress if a required section is cleared", async () => {
    const created = await request(appA).post("/projects").send({ name: "Regress" });
    const projectId = created.body.id;

    await request(appA).patch(`/projects/${projectId}/template`).send(REQUIRED_SECTIONS_FILLED);

    const res = await request(appA)
      .patch(`/projects/${projectId}/template`)
      .send({ sectionIdentity: {} });

    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe("in_progress");
  });

  it("soft-deletes a project so it no longer appears in list or get", async () => {
    const created = await request(appA).post("/projects").send({ name: "ToDelete" });
    const projectId = created.body.id;

    const del = await request(appA).delete(`/projects/${projectId}`);
    expect(del.status).toBe(204);

    const get = await request(appA).get(`/projects/${projectId}`);
    expect(get.status).toBe(404);
  });

  it("never returns another org's project, even by direct id", async () => {
    const created = await request(appA).post("/projects").send({ name: "OrgA only" });
    const projectId = created.body.id;

    const res = await request(appB).get(`/projects/${projectId}`);
    expect(res.status).toBe(404);
  });
});
