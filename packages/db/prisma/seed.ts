/**
 * Local dev / demo seed data. Idempotent (upsert-based) -- safe to re-run.
 * Run via `npm run seed --workspace @prompter/db` or `prisma db seed`.
 */
import { prisma, withTenantContext } from "../src/index.js";

const DEMO_CLERK_ORG_ID = "seed_demo_org";
const DEMO_CLERK_USER_ID = "seed_demo_user";

async function main() {
  const org = await prisma.org.upsert({
    where: { clerkOrgId: DEMO_CLERK_ORG_ID },
    update: {},
    create: {
      name: "Seed Demo Org",
      slug: "seed-demo-org",
      clerkOrgId: DEMO_CLERK_ORG_ID,
    },
  });

  const member = await prisma.member.upsert({
    where: { clerkUserId: DEMO_CLERK_USER_ID },
    update: {},
    create: {
      clerkUserId: DEMO_CLERK_USER_ID,
      email: "demo-owner@example.com",
      name: "Demo Owner",
    },
  });

  await withTenantContext(prisma, org.id, async (tx) => {
    const existingMembership = await tx.orgMembership.findFirst({ where: { memberId: member.id } });
    if (!existingMembership) {
      await tx.orgMembership.create({
        data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
      });
    }

    const existingProject = await tx.project.findFirst({ where: { name: "Prompter (seed demo)" } });
    if (existingProject) {
      console.log("Seed project already exists, skipping.");
      return;
    }

    const project = await tx.project.create({
      data: {
        orgId: org.id,
        createdBy: member.id,
        name: "Prompter (seed demo)",
        status: "ready_to_export",
        templateVersion: "1.0.0",
      },
    });

    await tx.templateResponse.create({
      data: {
        projectId: project.id,
        orgId: org.id,
        completenessPct: 100,
        sectionIdentity: {
          productName: "Prompter",
          positioning: "The structured intake tool that turns a vague product idea into a rigorous, phase-gated build prompt for AI coding agents.",
        },
        sectionRoles: [
          { role: "Member", canDo: "Create/edit projects, export, deliver" },
          { role: "Owner", canDo: "Everything a Member can, plus billing and org management" },
        ],
        sectionDomainModel: {
          entities: "Org 1---* Project 1---1 TemplateResponse; Project 1---* Export; Org 1---1 Wallet",
        },
        sectionTechStack: [
          { layer: "Frontend", choice: "React 19 + Vite" },
          { layer: "Backend", choice: "Express 5" },
          { layer: "Database", choice: "PostgreSQL 16 + Prisma" },
        ],
        sectionMvpScope: ["Wizard", "Export (.md/.docx/.pdf)", "Copy for AI tool", "Wallet billing"],
        sectionNfr: "Tenant isolation proven via automated test; OWASP Top-10 pass.",
        sectionIntegrations: [
          { service: "Clerk", purpose: "auth" },
          { service: "Razorpay", purpose: "credit-pack payments" },
        ],
        sectionUiUx: "Match Linear's information density and minimal chrome.",
        sectionDeliverables: "Operator runbook, API docs, seed data, admin guide.",
      },
    });

    console.log("Seeded demo project:", project.id);
  });

  console.log("Seed complete:", { orgId: org.id, memberId: member.id });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
