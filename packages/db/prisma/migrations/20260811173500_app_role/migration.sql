-- The role migrations run as (table owner) may be a Postgres superuser in
-- some environments (e.g. Docker's default POSTGRES_USER). Superusers and
-- table owners bypass RLS regardless of FORCE ROW LEVEL SECURITY -- so the
-- application must run its normal (non-admin) traffic as a distinct,
-- non-superuser, non-owner role for the enable_rls migration's policies to
-- mean anything. This is that role.
--
-- Passwords are intentionally NOT set here (no secret belongs in versioned
-- migration SQL, per Definition of Done #4). Set them out-of-band:
--   local dev:  docker exec into postgres and run ALTER ROLE ... PASSWORD '...'
--   staging/prod: set via the hosting provider's secret-backed provisioning step
-- and put the resulting connection string only in .env (gitignored) /
-- the host's secret manager -- never in a migration file.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role WITH LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- Clear the placeholder password set on platform_admin_role in the previous
-- migration -- same reasoning as above, it must not persist in history as a
-- usable credential.
ALTER ROLE platform_admin_role WITH PASSWORD NULL;
