-- Stage F hardening: every RLS policy filters on org_id, on every single
-- tenant-scoped query, and none of these tables had an index on it -- a
-- full table scan on every request, getting worse as row counts grow.
-- Wallet.org_id and OrgMembership already have it implicitly via existing
-- unique constraints, so they're not repeated here.

CREATE INDEX "projects_org_id_idx" ON "projects" ("org_id");
CREATE INDEX "template_responses_org_id_idx" ON "template_responses" ("org_id");
CREATE INDEX "exports_org_id_idx" ON "exports" ("org_id");
CREATE INDEX "exports_project_id_idx" ON "exports" ("project_id");
CREATE INDEX "delivery_records_org_id_idx" ON "delivery_records" ("org_id");
CREATE INDEX "delivery_records_project_id_idx" ON "delivery_records" ("project_id");
CREATE INDEX "credit_purchases_org_id_idx" ON "credit_purchases" ("org_id");
CREATE INDEX "wallet_transactions_org_id_idx" ON "wallet_transactions" ("org_id");
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions" ("wallet_id");
CREATE INDEX "ai_assist_requests_org_id_idx" ON "ai_assist_requests" ("org_id");
CREATE INDEX "ai_assist_requests_project_id_idx" ON "ai_assist_requests" ("project_id");
CREATE INDEX "admin_access_log_org_id_idx" ON "admin_access_log" ("org_id");
