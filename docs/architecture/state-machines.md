# Prompter — State Machines

Expands the Section 3 state machine sketch with every transition, trigger, and edge case.

## Project lifecycle

```
Draft -> InProgress -> ReadyToExport -> Exported -> Delivered
```

| Transition | Trigger |
|---|---|
| Draft → InProgress | First save of any `TemplateResponse` field |
| InProgress → InProgress | Further field edits while required fields remain incomplete |
| InProgress → ReadyToExport | **Hard gate:** validation passes — every required field in Sections 1–8 and 10 is non-empty (mirrors Section 2's "every row must be filled" rule) |
| ReadyToExport → Exported | A successful `Export` is generated (any format) |
| Exported → Exported | Additional exports of any format; `Export.version` increments |
| Exported → Delivered | **Hard gate:** a successful `DeliveryRecord` exists — requires at least one successful `Export` first (already satisfied by being in `Exported`) |
| Delivered → Delivered | Additional deliveries to other tools/methods |
| Exported → InProgress | Editing any required field after export invalidates the export — forces re-validation before the project can be marked exported again |
| Delivered → InProgress | Same as above — editing a required field after delivery reverts the project so stale delivered content isn't assumed current |
| Draft → ReadyToExport | **Clarified during Stage C build:** a single save that fills every required section at once (e.g. a bulk import) goes straight from Draft to ReadyToExport in one step — status always reflects current completeness, not a literal walk through InProgress first. |

### Edge cases
- **Member removed mid-project:** `Project.created_by` is a historical reference only, not an access grant — removal doesn't affect the project. Any remaining active Owner/Member in the org can continue editing.
- **Org suspended (Platform Admin action):** all `Project` state transitions are blocked; the project becomes read-only regardless of current state until the org is reactivated.
- **Plan/usage limit hit mid-edit:** editing an already-created project is always allowed; only *creating a new* `Project` is blocked by the plan-limit gate below.
- **Deletion:** allowed from any state, by any Member or Owner in the project's org; implemented as soft delete (`deleted_at`) so `Export`/`DeliveryRecord` audit history is preserved.

### Hard gate — wallet/credit interplay
`An Export cannot be generated ("attempt") unless the org's Wallet has either an unused free hourly export entitlement or a positive purchased-credit balance.` (from Section 3) This gates `Export` creation, not `Project` creation — a Project can always be created and edited for free; only the export action costs a credit (per the "attempt = one export generation" decision).

---

## Wallet / Credit lifecycle

This replaces a traditional subscription-tier model: there is no recurring plan state. Every org has exactly one `Wallet` with two independent credit sources.

**Source 1 — free hourly entitlement (non-stacking):**
```
Available -> Consumed -> Available (after 1 hour elapses)
```
| Transition | Trigger |
|---|---|
| Available → Consumed | Org generates an export and `wallet.last_free_export_at` is null or more than 1 hour in the past → this export is free, `last_free_export_at` is set to now |
| Consumed → Available | Purely time-based: becomes available again once `now - last_free_export_at >= 1 hour`. No accumulation — an unused hour does not carry over or stack. |

**Source 2 — purchased credit balance (persistent, never expires):**
```
(no balance) -> balance > 0 -> (spent to 0) -> (no balance)
```
| Transition | Trigger |
|---|---|
| Balance increases | `CreditPurchase.status` becomes `completed` via Stripe webhook `payment_intent.succeeded` → `Wallet.balance += credits_granted`, a `WalletTransaction(type=purchase_credit)` row is written |
| Balance decreases | Org generates an export **and** the free hourly entitlement is currently `Consumed` (unavailable) → debit 1 from `Wallet.balance`, write `WalletTransaction(type=paid_export_debit)` |
| Balance stays at 0 | Further export attempts are blocked (see hard gate above) until either the free entitlement becomes `Available` again or a new purchase completes |

### Export attempt resolution order
1. Is the free hourly entitlement `Available`? → use it, mark `Consumed`, `Export.credit_source = free_hourly`, no charge.
2. Else, is `Wallet.balance > 0`? → debit 1, `Export.credit_source = purchased`.
3. Else → block the export, prompt the Owner to purchase a credit pack.

### Edge cases
- **No rate cap beyond the balance itself** — purchased credits can be spent as fast as the org can generate exports; the only throttle is the 1-hour non-stacking rule on the *free* source (per your explicit answer: "no separate cap — just spend down the balance").
- **Webhook processing must be idempotent** — Stripe may redeliver `payment_intent.succeeded`; `stripe_payment_intent_id` must be de-duplicated (unique constraint on `CreditPurchase.stripe_payment_intent_id`) before incrementing `Wallet.balance`.
- **Concurrent export requests:** the resolution-order check-and-debit must happen inside a single DB transaction with a row lock on `Wallet` to prevent two simultaneous exports from both reading `balance = 1` and over-spending.
- **Credits never expire** — no expiry job/state needed for purchased balance.
