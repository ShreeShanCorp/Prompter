import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type CreditPack } from "../lib/apiClient";
import { openRazorpayCheckout } from "../lib/razorpayCheckout";

const PACKS: { pack: CreditPack; label: string; priceLabel: string }[] = [
  { pack: "starter_1usd_2credits", label: "2 credits", priceLabel: "₹99" },
  { pack: "value_5usd_20credits", label: "20 credits", priceLabel: "₹449" },
];

export function WalletPanel() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const walletQuery = useQuery({ queryKey: ["wallet"], queryFn: api.getWallet });

  const buyMutation = useMutation({
    mutationFn: (pack: CreditPack) => api.createCreditPurchase(pack),
    onSuccess: async (order) => {
      setError(null);
      if (!order.keyId) {
        setError("Billing not configured yet -- Razorpay keys are missing on the server.");
        return;
      }
      try {
        await openRazorpayCheckout(
          { keyId: order.keyId, orderId: order.orderId, amountInr: order.amountInr },
          () => void queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open checkout.");
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 503) {
        setError("Billing not configured yet -- Razorpay keys are missing on the server.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only an org Owner can purchase credits.");
      } else {
        setError("Could not start checkout.");
      }
    },
  });

  return (
    <div className="mb-8 rounded-lg border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Wallet</h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {walletQuery.data ? `${walletQuery.data.balance} credits` : "..."}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        {PACKS.map(({ pack, label, priceLabel }) => (
          <button
            key={pack}
            onClick={() => buyMutation.mutate(pack)}
            disabled={buyMutation.isPending}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
          >
            Buy {label} — {priceLabel}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
