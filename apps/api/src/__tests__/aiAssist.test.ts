/**
 * Integration test against the live local Postgres proving the AI-assist
 * route and its documented fallback (Section 7: unavailable, not silent
 * failure, when no API key is configured). Uses a fake AiAssistClient so
 * this never makes a real network call.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeTenantScope } from "./testAuth.js";
import type { AiAssistClient } from "../lib/aiAssist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../packages/db/.env") });

const { prisma, withTenantContext } = await import("@prompter/db");
const { createProjectsRouter } = await import("../routes/projects.js");
const express = (await import("express")).default;

const fakeClient: AiAssistClient = {
  async draft({ sectionLabel, inputText }) {
    return {
      outputText: `[drafted for ${sectionLabel}] ${inputText}`,
      model: "fake-model",
      tokensUsed: 42,
    };
  },
};

async function seedProject(scope: "with-client" | "without-client" | "rate-limit") {
  const org = await prisma.org.create({
    data: {
      name: "AI Assist Test Org",
      slug: `ai-assist-test-org-${scope}-${Date.now()}`,
      clerkOrgId: `clerk_org_ai_${scope}_${Date.now()}`,
    },
  });
  const member = await prisma.member.create({
    data: { clerkUserId: `clerk_user_ai_${scope}_${Date.now()}`, email: `${scope}@example.com` },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "owner", status: "active" },
    }),
  );

  const app = express();
  app.use(express.json());
  const { defaultExportStorage } = await import("../lib/exportStorage.js");
  app.use(
    createProjectsRouter(
      fakeTenantScope({ orgId: org.id, memberId: member.id, role: "owner", isPlatformAdmin: false }),
      defaultExportStorage,
      scope === "without-client" ? null : fakeClient,
    ),
  );

  const created = await request(app).post("/projects").send({ name: "AI Assist Target" });
  return { org, member, app, projectId: created.body.id as string };
}

describe("ai-assist", () => {
  let withClient: Awaited<ReturnType<typeof seedProject>>;
  let withoutClient: Awaited<ReturnType<typeof seedProject>>;
  let rateLimitCtx: Awaited<ReturnType<typeof seedProject>>;

  beforeAll(async () => {
    withClient = await seedProject("with-client");
    withoutClient = await seedProject("without-client");
    // Own org so this test's request count starts at zero -- the rate
    // limiter is keyed per-org, and other tests in this file already spend
    // some of withClient's budget.
    rateLimitCtx = await seedProject("rate-limit");
  });

  afterAll(async () => {
    for (const ctx of [withClient, withoutClient, rateLimitCtx]) {
      await withTenantContext(prisma, ctx.org.id, (tx) => tx.aIAssistRequest.deleteMany({}));
      await withTenantContext(prisma, ctx.org.id, (tx) => tx.templateResponse.deleteMany({}));
      await withTenantContext(prisma, ctx.org.id, (tx) => tx.project.deleteMany({}));
      await withTenantContext(prisma, ctx.org.id, (tx) => tx.orgMembership.deleteMany({}));
    }
    await prisma.member.deleteMany({
      where: { id: { in: [withClient.member.id, withoutClient.member.id] } },
    });
    await prisma.org.deleteMany({ where: { id: { in: [withClient.org.id, withoutClient.org.id] } } });
    await prisma.$disconnect();
  });

  it("rejects an unrecognized section id", async () => {
    const res = await request(withClient.app)
      .post(`/projects/${withClient.projectId}/ai-assist`)
      .send({ section: "not_a_real_section", inputText: "hello" });
    expect(res.status).toBe(400);
  });

  it("rejects empty input text", async () => {
    const res = await request(withClient.app)
      .post(`/projects/${withClient.projectId}/ai-assist`)
      .send({ section: "sectionIdentity", inputText: "  " });
    expect(res.status).toBe(400);
  });

  it("returns a draft and records an AIAssistRequest for audit/cost tracking", async () => {
    const res = await request(withClient.app)
      .post(`/projects/${withClient.projectId}/ai-assist`)
      .send({ section: "sectionIdentity", inputText: "a tool for filling build prompts" });

    expect(res.status).toBe(200);
    expect(res.body.outputText).toContain("Product Identity & Positioning");
    expect(res.body.model).toBe("fake-model");

    const stored = await withTenantContext(prisma, withClient.org.id, (tx) =>
      tx.aIAssistRequest.findMany({ where: { projectId: withClient.projectId } }),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokensUsed).toBe(42);
    expect(stored[0]?.section).toBe("sectionIdentity");
  });

  it("returns 503 (not a silent failure) when no AI-assist client is configured", async () => {
    const res = await request(withoutClient.app)
      .post(`/projects/${withoutClient.projectId}/ai-assist`)
      .send({ section: "sectionIdentity", inputText: "anything" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("ai_assist_unavailable");
  });

  it(
    "rate-limits after 20 requests per org per hour (no wallet gate on this endpoint, unlike exports)",
    async () => {
      for (let i = 0; i < 20; i++) {
        const res = await request(rateLimitCtx.app)
          .post(`/projects/${rateLimitCtx.projectId}/ai-assist`)
          .send({ section: "sectionIdentity", inputText: `attempt ${i}` });
        expect(res.status).toBe(200);
      }
      const blocked = await request(rateLimitCtx.app)
        .post(`/projects/${rateLimitCtx.projectId}/ai-assist`)
        .send({ section: "sectionIdentity", inputText: "one too many" });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe("rate_limited");
    },
    20_000,
  );
});
