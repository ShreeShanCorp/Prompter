import { Router, type RequestHandler } from "express";
import { prisma, withTenantContext } from "@prompter/db";
import type { CreditPack } from "@prompter/db";
import { tenantScope, requireRole } from "../middleware/tenantScope.js";
import { getOrCreateWallet } from "../lib/wallet.js";
import { createDefaultPaymentClient, PACK_DETAILS, type PaymentClient } from "../lib/razorpay.js";

const SUPPORTED_PACKS: CreditPack[] = ["starter_1usd_2credits", "value_5usd_20credits"];

export function createBillingRouter(
  scopeMiddleware: RequestHandler = tenantScope,
  paymentClient: PaymentClient | null = createDefaultPaymentClient(),
) {
  const billingRouter = Router();

  billingRouter.use(scopeMiddleware);

  billingRouter.get("/billing/credit-purchases", async (req, res) => {
    const tenant = req.tenant!;
    const purchases = await withTenantContext(prisma, tenant.orgId, (tx) =>
      tx.creditPurchase.findMany({ orderBy: { createdAt: "desc" } }),
    );
    res.json(purchases);
  });

  billingRouter.post("/billing/credit-purchases", requireRole("owner"), async (req, res) => {
    const tenant = req.tenant!;
    const { pack } = req.body as { pack?: string };

    if (!pack || !SUPPORTED_PACKS.includes(pack as CreditPack)) {
      res.status(400).json({ error: "unsupported_pack", supported: SUPPORTED_PACKS });
      return;
    }
    if (!paymentClient) {
      res.status(503).json({ error: "billing_unavailable", detail: "Razorpay keys not configured" });
      return;
    }

    // The order is created via an external API call, so it happens outside
    // any DB transaction -- then the CreditPurchase row records the result.
    const order = await paymentClient.createOrder(pack as CreditPack, `${tenant.orgId}-${Date.now()}`);

    const purchase = await withTenantContext(prisma, tenant.orgId, async (tx) => {
      const wallet = await getOrCreateWallet(tx, tenant.orgId);
      const { credits } = PACK_DETAILS[pack as CreditPack];
      return tx.creditPurchase.create({
        data: {
          orgId: tenant.orgId,
          walletId: wallet.id,
          purchasedBy: tenant.memberId,
          pack: pack as CreditPack,
          creditsGranted: credits,
          amountInr: order.amountInr,
          razorpayOrderId: order.orderId,
          status: "pending",
        },
      });
    });

    res.status(201).json({
      creditPurchaseId: purchase.id,
      orderId: order.orderId,
      amountInr: order.amountInr,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  });

  return billingRouter;
}

export const billingRouter = createBillingRouter();
