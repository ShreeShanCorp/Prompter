import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/**
 * AI-assist is the only endpoint with real unmetered external cost (each
 * call is a paid Anthropic API request) and no wallet/credit gate -- see
 * requirements-lock.md's note that AI-assist billing was intentionally left
 * ungated in Section 5. Without a throttle, one org could run up API costs
 * with no economic brake (unlike exports, which cost a credit).
 *
 * In-memory store: fine for a single API instance. Move to a Redis-backed
 * store (Redis is already in the stack for BullMQ) before horizontal
 * scaling -- an in-memory limiter doesn't share state across processes.
 */
export const aiAssistRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Keyed by org once tenantScope has resolved it (the normal case); falls
  // back to a normalized IP key (via ipKeyGenerator, which correctly
  // handles IPv6 address variants) only if req.tenant is somehow unset --
  // shouldn't happen in practice since tenantScope runs first and would
  // already have rejected an unauthenticated request.
  keyGenerator: (req: Request) => req.tenant?.orgId ?? ipKeyGenerator(req.ip ?? "unknown"),
  message: { error: "rate_limited", detail: "Too many AI-assist requests. Try again later." },
});
