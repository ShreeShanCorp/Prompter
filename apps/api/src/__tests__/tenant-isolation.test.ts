/**
 * Verifies Section 5 must-have #9 and the checklist in
 * docs/architecture/multi-tenancy.md: two orgs' data must be unreadable and
 * unwritable across the tenant boundary, at both the Postgres RLS layer
 * (Layer 1) and the Prisma tenant-scoping extension (Layer 2), independently.
 *
 * Requires a live Postgres with the enable_rls migration applied -- run
 * `docker compose up -d postgres` and `npm run migrate:dev -w @prompter/db`
 * before running this test.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../packages/db/.env") });

const { prisma, withTenantContext } = await import("@prompter/db");

async function createOrgWithProject(label: string) {
  const org = await prisma.org.create({
    data: {
      name: `Test Org ${label}`,
      slug: `test-org-${label}-${Date.now()}`,
      clerkOrgId: `clerk_org_${label}_${Date.now()}`,
    },
  });
  const member = await prisma.member.create({
    data: {
      clerkUserId: `clerk_user_${label}_${Date.now()}`,
      email: `${label}@example.com`,
    },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    }),
  );
  const project = await withTenantContext(prisma, org.id, (tx) =>
    tx.project.create({
      data: {
        orgId: org.id,
        createdBy: member.id,
        name: `${label} project`,
        templateVersion: "v1",
      },
    }),
  );
  return { org, member, project };
}

describe("tenant isolation", () => {
  let orgA: Awaited<ReturnType<typeof createOrgWithProject>>;
  let orgB: Awaited<ReturnType<typeof createOrgWithProject>>;

  beforeAll(async () => {
    orgA = await createOrgWithProject("a");
    orgB = await createOrgWithProject("b");
  });

  afterAll(async () => {
    await withTenantContext(prisma, orgA.org.id, (tx) => tx.project.deleteMany({}));
    await withTenantContext(prisma, orgB.org.id, (tx) => tx.project.deleteMany({}));
    await withTenantContext(prisma, orgA.org.id, (tx) => tx.orgMembership.deleteMany({}));
    await withTenantContext(prisma, orgB.org.id, (tx) => tx.orgMembership.deleteMany({}));
    await prisma.member.deleteMany({ where: { id: { in: [orgA.member.id, orgB.member.id] } } });
    await prisma.org.deleteMany({ where: { id: { in: [orgA.org.id, orgB.org.id] } } });
    await prisma.$disconnect();
  });

  it("Layer 2 (Prisma extension): org A's scoped client cannot see org B's project by id", async () => {
    const result = await withTenantContext(prisma, orgA.org.id, (tx) =>
      tx.project.findUnique({ where: { id: orgB.project.id } }),
    );
    expect(result).toBeNull();
  });

  it("Layer 2 (Prisma extension): org A's project list never includes org B's rows", async () => {
    const projects = await withTenantContext(prisma, orgA.org.id, (tx) => tx.project.findMany());
    expect(projects.every((p) => p.orgId === orgA.org.id)).toBe(true);
    expect(projects.some((p) => p.id === orgB.project.id)).toBe(false);
  });

  it("Layer 1 (Postgres RLS): a deliberately unscoped raw query, run inside an org-A transaction, cannot see org B's row", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${orgA.org.id}'`);
      // No WHERE org_id filter at all -- proves RLS blocks it independently
      // of the application-layer (Prisma extension) filter.
      return tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM projects`);
    });
    expect(rows.some((r) => r.id === orgB.project.id)).toBe(false);
    expect(rows.some((r) => r.id === orgA.project.id)).toBe(true);
  });

  it("Layer 1 (Postgres RLS): with no app.current_org_id set, no tenant rows are visible at all", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      return tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM projects`);
    });
    expect(rows.some((r) => r.id === orgA.project.id || r.id === orgB.project.id)).toBe(false);
  });

  it("Layer 2: attempting to update org B's project while scoped to org A affects zero rows", async () => {
    const result = await withTenantContext(prisma, orgA.org.id, (tx) =>
      tx.project.updateMany({
        where: { id: orgB.project.id },
        data: { name: "hijacked" },
      }),
    );
    expect(result.count).toBe(0);

    const unchanged = await withTenantContext(prisma, orgB.org.id, (tx) =>
      tx.project.findUniqueOrThrow({ where: { id: orgB.project.id } }),
    );
    expect(unchanged.name).toBe("b project");
  });

  it("scoped create always attaches the calling org's id, even if a caller passed a different orgId", async () => {
    const spoofed = await withTenantContext(prisma, orgA.org.id, (tx) =>
      tx.project.create({
        data: {
          orgId: orgB.org.id,
          createdBy: orgA.member.id,
          name: "spoof attempt",
          templateVersion: "v1",
        },
      }),
    );
    expect(spoofed.orgId).toBe(orgA.org.id);
    await withTenantContext(prisma, orgA.org.id, (tx) => tx.project.delete({ where: { id: spoofed.id } }));
  });
});
