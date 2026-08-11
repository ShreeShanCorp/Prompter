import express, { Router } from "express";
import { getSystemPrisma } from "@prompter/db";
import { verifyWebhookSignature } from "../lib/razorpay.js";
import { createDefaultEmailClient, type EmailClient } from "../lib/email.js";

interface RazorpayPaymentCapturedEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
      };
    };
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function receiptEmailHtml(orgName: string, creditsGranted: number, amountInr: string): string {
  // orgName is user-controlled (set via Clerk org creation) -- must be
  // escaped before interpolating into HTML sent to another user's inbox.
  return `
    <p>Thanks for your purchase!</p>
    <p><strong>${escapeHtml(orgName)}</strong>'s Prompter wallet was credited with <strong>${creditsGranted} export credits</strong>.</p>
    <p>Amount charged: ₹${amountInr}</p>
  `;
}

/**
 * Mounted BEFORE express.json() in app.ts -- signature verification needs
 * the raw request body, not a re-serialized parsed one. Uses the system
 * (RLS-bypassing) Prisma client since there's no user session to derive
 * app.current_org_id from -- see getSystemPrisma().
 */
export function createRazorpayWebhookRouter(emailClient: EmailClient = createDefaultEmailClient()) {
  const router = Router();

  router.post("/webhooks/razorpay", express.raw({ type: "application/json" }), async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).json({ error: "webhook_not_configured" });
      return;
    }

    const rawBody = req.body as Buffer;
    const signature = req.header("x-razorpay-signature");
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      res.status(400).json({ error: "invalid_signature" });
      return;
    }

    const event = JSON.parse(rawBody.toString("utf-8")) as RazorpayPaymentCapturedEvent;
    if (event.event !== "payment.captured") {
      res.status(200).json({ ignored: true });
      return;
    }

    const orderId = event.payload?.payment?.entity?.order_id;
    const paymentId = event.payload?.payment?.entity?.id;
    if (!orderId || !paymentId) {
      res.status(400).json({ error: "malformed_payload" });
      return;
    }

    const systemPrisma = getSystemPrisma();
    if (!systemPrisma) {
      res.status(503).json({ error: "system_db_not_configured" });
      return;
    }

    const receipt = await systemPrisma.$transaction(async (tx) => {
      // Idempotent: only the first delivery of this event (status still
      // "pending") does anything. Razorpay may redeliver the same event.
      const updated = await tx.creditPurchase.updateMany({
        where: { razorpayOrderId: orderId, status: "pending" },
        data: { status: "completed", razorpayPaymentId: paymentId },
      });
      if (updated.count === 0) return null;

      const purchase = await tx.creditPurchase.findUniqueOrThrow({
        where: { razorpayOrderId: orderId },
      });
      await tx.wallet.update({
        where: { id: purchase.walletId },
        data: { balance: { increment: purchase.creditsGranted } },
      });
      await tx.walletTransaction.create({
        data: {
          orgId: purchase.orgId,
          walletId: purchase.walletId,
          type: "purchase_credit",
          amount: purchase.creditsGranted,
          relatedCreditPurchaseId: purchase.id,
        },
      });

      const [purchaser, org] = await Promise.all([
        tx.member.findUniqueOrThrow({ where: { id: purchase.purchasedBy } }),
        tx.org.findUniqueOrThrow({ where: { id: purchase.orgId } }),
      ]);
      return {
        purchaserEmail: purchaser.email,
        orgName: org.name,
        creditsGranted: purchase.creditsGranted,
        amountInr: purchase.amountInr.toString(),
      };
    });

    // Best-effort: a failed receipt email must not fail webhook processing
    // (Razorpay would otherwise retry an already-completed purchase).
    if (receipt) {
      try {
        // Strip newlines from the org name before it reaches an email
        // header -- header-injection defense-in-depth even though the
        // Resend SDK/API already rejects raw CRLF in subjects.
        const safeOrgName = receipt.orgName.replace(/[\r\n]+/g, " ");
        await emailClient.send({
          to: receipt.purchaserEmail,
          subject: `Prompter — ${receipt.creditsGranted} credits added to ${safeOrgName}`,
          html: receiptEmailHtml(safeOrgName, receipt.creditsGranted, receipt.amountInr),
        });
      } catch (err) {
        console.error("[razorpay webhook] receipt email failed to send:", err);
      }
    }

    res.status(200).json({ ok: true });
  });

  return router;
}
