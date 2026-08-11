-- Stage D: swap payment processor from Stripe to Razorpay (India doesn't
-- support Stripe). No rows exist yet in these tables (no purchases have
-- ever been made), so this is a straight drop/add rather than a data
-- migration.

ALTER TABLE wallets DROP COLUMN IF EXISTS stripe_customer_id;

ALTER TABLE credit_purchases DROP COLUMN IF EXISTS stripe_payment_intent_id;
ALTER TABLE credit_purchases RENAME COLUMN amount_usd TO amount_inr;
ALTER TABLE credit_purchases ADD COLUMN razorpay_order_id TEXT;
ALTER TABLE credit_purchases ADD COLUMN razorpay_payment_id TEXT;

-- Backfill not needed (table is empty), so it's safe to enforce NOT NULL now.
ALTER TABLE credit_purchases ALTER COLUMN razorpay_order_id SET NOT NULL;

CREATE UNIQUE INDEX credit_purchases_razorpay_order_id_key ON credit_purchases (razorpay_order_id);
CREATE UNIQUE INDEX credit_purchases_razorpay_payment_id_key ON credit_purchases (razorpay_payment_id);
