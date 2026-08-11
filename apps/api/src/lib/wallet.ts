import type { TenantScopedClient } from "@prompter/db";
import type { CreditSource } from "@prompter/shared";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("insufficient_credits");
  }
}

const FREE_EXPORT_WINDOW_MS = 60 * 60 * 1000;

export async function getOrCreateWallet(tx: TenantScopedClient, orgId: string) {
  return tx.wallet.upsert({
    where: { orgId },
    update: {},
    create: { orgId, balance: 0 },
  });
}

/**
 * Resolves and atomically consumes one export credit, per the resolution
 * order in docs/architecture/state-machines.md:
 *   1. free hourly entitlement (non-stacking)
 *   2. purchased balance
 *   3. otherwise blocked
 *
 * Uses conditional `updateMany` (UPDATE ... WHERE <still eligible>) instead
 * of a manual SELECT-then-write row lock -- Postgres guarantees the WHERE
 * check and the write happen atomically, so two concurrent requests can't
 * both read balance=1 and both succeed.
 */
export async function consumeExportCredit(
  tx: TenantScopedClient,
  orgId: string,
): Promise<{ source: CreditSource; walletId: string }> {
  const wallet = await getOrCreateWallet(tx, orgId);
  const now = new Date();
  const freeWindowCutoff = new Date(now.getTime() - FREE_EXPORT_WINDOW_MS);

  const freeGrant = await tx.wallet.updateMany({
    where: {
      orgId,
      OR: [{ lastFreeExportAt: null }, { lastFreeExportAt: { lt: freeWindowCutoff } }],
    },
    data: { lastFreeExportAt: now },
  });
  if (freeGrant.count === 1) {
    return { source: "free_hourly", walletId: wallet.id };
  }

  const paidDebit = await tx.wallet.updateMany({
    where: { orgId, balance: { gt: 0 } },
    data: { balance: { decrement: 1 } },
  });
  if (paidDebit.count === 1) {
    return { source: "purchased", walletId: wallet.id };
  }

  throw new InsufficientCreditsError();
}
