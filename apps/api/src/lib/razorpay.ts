import crypto from "node:crypto";
import Razorpay from "razorpay";
import type { CreditPack } from "@prompter/db";

/**
 * INR pricing for the credit packs locked in requirements-lock.md ($1=2
 * credits, $5=20 credits) -- Razorpay settles Indian merchants in INR, not
 * USD, so these are the actual charged amounts. Round numbers close to the
 * USD reference price, an architect's-call detail like the other pack
 * decisions in requirements-lock.md.
 */
export const PACK_DETAILS: Record<CreditPack, { credits: number; amountInr: number }> = {
  starter_1usd_2credits: { credits: 2, amountInr: 99 },
  value_5usd_20credits: { credits: 20, amountInr: 449 },
};

export interface CreatedOrder {
  orderId: string;
  amountInr: number;
  currency: "INR";
}

export interface PaymentClient {
  createOrder(pack: CreditPack, receipt: string): Promise<CreatedOrder>;
}

/**
 * Real Razorpay-backed implementation, injected via an interface (same
 * pattern as AiAssistClient/ExportStorage) so tests don't need live keys or
 * network access.
 */
export class RazorpayPaymentClient implements PaymentClient {
  private readonly client: Razorpay;

  constructor(keyId: string, keySecret: string) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(pack: CreditPack, receipt: string): Promise<CreatedOrder> {
    const { amountInr } = PACK_DETAILS[pack];
    const order = await this.client.orders.create({
      amount: amountInr * 100, // paise
      currency: "INR",
      receipt,
    });
    return { orderId: order.id, amountInr, currency: "INR" };
  }
}

/** Returns null when Razorpay keys are absent -- Section 7's documented fallback. */
export function createDefaultPaymentClient(): PaymentClient | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new RazorpayPaymentClient(keyId, keySecret);
}

/**
 * Razorpay signs webhook payloads as HMAC-SHA256(rawBody, webhookSecret),
 * sent in the X-Razorpay-Signature header. Verified against the raw request
 * body -- must run before any JSON parsing/re-serialization touches it.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret: string,
): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
