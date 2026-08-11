-- The enable_rls migration granted platform_admin_role table-level DML
-- privileges but never USAGE on the schema itself -- Postgres requires both,
-- so every query under this role failed with "permission denied for schema
-- public" until now. Found while wiring up the Razorpay webhook handler
-- (the first real caller of getSystemPrisma()).
GRANT USAGE ON SCHEMA public TO platform_admin_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO platform_admin_role;
