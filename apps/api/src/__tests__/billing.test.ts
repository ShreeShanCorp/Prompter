/**
 * Integration test against the live local Postgres proving the Razorpay
 * credit-purchase flow: order creation, RBAC (Owner-only), and the webhook
 * crediting the wallet via a real HMAC-SHA256 signature (not mocked) using
 * the system (RLS-bypassing) client -- see razorpay.ts / razorpayWebhook.ts.
 */
import { config } from "dotenv";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeTenantScope } from "./testAuth.js";
import type { PaymentClient } from "../lib/razorpay.js";
import type { EmailClient, EmailMessage } from "../lib/email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../packages/db/.env") });

const { prisma, withTenantContext, getSystemPrisma } = await import("@prompter/db");
const { createProjectsRouter } = await import("../routes/projects.js");
const { createBillingRouter } = await import("../routes/billing.js");
const { createRazorpayWebhookRouter } = await import("../routes/razorpayWebhook.js");
const express = (await import("express")).default;

const WEBHOOK_SECRET = "test_webhook_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

let orderCounter = 0;
const fakePaymentClient: PaymentClient = {
  async createOrder(pack, receipt) {
    orderCounter += 1;
    const amountInr = pack === "starter_1usd_2credits" ? 99 : 449;
    return { orderId: `order_fake_${orderCounter}_${receipt}`, amountInr, currency: "INR" };
  },
};

function signPayload(payload: object): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(Buffer.from(body)).digest("hex");
  return { body, signature };
}

async function seedOrgWithOwner() {
  const org = await prisma.org.create({
    data: {
      name: "Billing Test Org",
      slug: `billing-test-org-${Date.now()}`,
      clerkOrgId: `clerk_org_billing_${Date.now()}`,
    },
  });
  const owner = await prisma.member.create({
    data: { clerkUserId: `clerk_user_billing_owner_${Date.now()}`, email: "owner@example.com" },
  });
  const member = await prisma.member.create({
    data: { clerkUserId: `clerk_user_billing_member_${Date.now()}`, email: "member@example.com" },
  });
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: owner.id, role: "owner", status: "active" },
    }),
  );
  await withTenantContext(prisma, org.id, (tx) =>
    tx.orgMembership.create({
      data: { orgId: org.id, memberId: member.id, role: "member", status: "active" },
    }),
  );

  const ownerApp = express();
  ownerApp.use(express.json());
  ownerApp.use(
    createProjectsRouter(
      fakeTenantScope({ orgId: org.id, memberId: owner.id, role: "owner", isPlatformAdmin: false }),
    ),
  );
  ownerApp.use(
    createBillingRouter(
      fakeTenantScope({ orgId: org.id, memberId: owner.id, role: "owner", isPlatformAdmin: false }),
      fakePaymentClient,
    ),
  );

  const memberApp = express();
  memberApp.use(express.json());
  memberApp.use(
    createBillingRouter(
      fakeTenantScope({ orgId: org.id, memberId: member.id, role: "member", isPlatformAdmin: false }),
      fakePaymentClient,
    ),
  );

  const sentEmails: EmailMessage[] = [];
  const fakeEmailClient: EmailClient = {
    async send(message) {
      sentEmails.push(message);
    },
  };

  const webhookApp = express();
  webhookApp.use(createRazorpayWebhookRouter(fakeEmailClient));

  return { org, owner, member, ownerApp, memberApp, webhookApp, sentEmails };
}

describe("billing (Razorpay credit purchases)", () => {
  let ctx: Awaited<ReturnType<typeof seedOrgWithOwner>>;

  beforeAll(async () => {
    ctx = await seedOrgWithOwner();
  });

  afterAll(async () => {
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.walletTransaction.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.creditPurchase.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.wallet.deleteMany({}));
    await withTenantContext(prisma, ctx.org.id, (tx) => tx.orgMembership.deleteMany({}));
    await prisma.member.deleteMany({ where: { id: { in: [ctx.owner.id, ctx.member.id] } } });
    await prisma.org.deleteMany({ where: { id: ctx.org.id } });
    await prisma.$disconnect();
    await getSystemPrisma()?.$disconnect();
  });

  it("rejects a non-Owner member trying to purchase credits", async () => {
    const res = await request(ctx.memberApp)
      .post("/billing/credit-purchases")
      .send({ pack: "starter_1usd_2credits" });
    expect(res.status).toBe(403);
  });

  it("lets the Owner create a Razorpay order for a credit pack", async () => {
    const res = await request(ctx.ownerApp)
      .post("/billing/credit-purchases")
      .send({ pack: "starter_1usd_2credits" });

    expect(res.status).toBe(201);
    expect(res.body.orderId).toMatch(/^order_fake_/);
    expect(res.body.amountInr).toBe(99);

    const purchases = await withTenantContext(prisma, ctx.org.id, (tx) =>
      tx.creditPurchase.findMany(),
    );
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.status).toBe("pending");
    expect(purchases[0]?.creditsGranted).toBe(2);
  });

  it("rejects a webhook call with an invalid signature", async () => {
    const purchases = await withTenantContext(prisma, ctx.org.id, (tx) => tx.creditPurchase.findMany());
    const orderId = purchases[0]!.razorpayOrderId;

    const res = await request(ctx.webhookApp)
      .post("/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", "not-a-real-signature")
      .send(
        JSON.stringify({
          event: "payment.captured",
          payload: { payment: { entity: { id: "pay_fake_1", order_id: orderId } } },
        }),
      );

    expect(res.status).toBe(400);
  });

  it("credits the wallet on a validly-signed payment.captured webhook, idempotently", async () => {
    const purchases = await withTenantContext(prisma, ctx.org.id, (tx) => tx.creditPurchase.findMany());
    const orderId = purchases[0]!.razorpayOrderId;

    const payload = {
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_fake_1", order_id: orderId } } },
    };
    const { body, signature } = signPayload(payload);

    const first = await request(ctx.webhookApp)
      .post("/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature)
      .send(body);
    expect(first.status).toBe(200);

    const wallet = await withTenantContext(prisma, ctx.org.id, (tx) =>
      tx.wallet.findUniqueOrThrow({ where: { orgId: ctx.org.id } }),
    );
    expect(wallet.balance).toBe(2);

    // Redelivery of the same event must not double-credit.
    const second = await request(ctx.webhookApp)
      .post("/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature)
      .send(body);
    expect(second.status).toBe(200);

    const walletAfterRedelivery = await withTenantContext(prisma, ctx.org.id, (tx) =>
      tx.wallet.findUniqueOrThrow({ where: { orgId: ctx.org.id } }),
    );
    expect(walletAfterRedelivery.balance).toBe(2);

    // Exactly one receipt email, not one per delivery attempt.
    expect(ctx.sentEmails).toHaveLength(1);
    expect(ctx.sentEmails[0]?.to).toBe("owner@example.com");
    expect(ctx.sentEmails[0]?.subject).toContain("2 credits");
    expect(ctx.sentEmails[0]?.html).toContain("Billing Test Org");
  });
});
