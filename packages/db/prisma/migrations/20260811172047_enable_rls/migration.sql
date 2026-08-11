-- Activates Row-Level Security per docs/architecture/multi-tenancy.md.
-- Applies to every table carrying org_id. `orgs` and `members` are not
-- RLS-scoped: `orgs` IS the tenant boundary, `members` is a global identity
-- table gated by OrgMembership checks in the application layer instead.

-- Dedicated role for the admin-panel service path, with BYPASSRLS.
-- Every query issued under this role must be preceded by an application-layer
-- write to admin_access_log (enforced in code, not by the database).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'platform_admin_role') THEN
    CREATE ROLE platform_admin_role WITH LOGIN BYPASSRLS PASSWORD 'changeme_in_env';
  END IF;
END
$$;

-- Helper macro-by-hand: enable RLS + force it for table owners too, then add
-- one tenant_isolation policy keyed off app.current_org_id.
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org_memberships
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE template_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON template_responses
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exports
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON delivery_records
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wallets
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_purchases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_purchases
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wallet_transactions
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE ai_assist_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assist_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_assist_requests
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

ALTER TABLE admin_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON admin_access_log
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

-- Grant the application's runtime role access to use these tables under RLS,
-- and grant platform_admin_role full bypass access for the audited support path.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO platform_admin_role;
