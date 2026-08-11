# Prompter — Multi-Tenancy Enforcement

Implements the Section 4 decision: shared schema with `org_id`, enforced by Postgres Row-Level Security **and** a backend middleware layer, as defense in depth.

## Layer 1 — Postgres Row-Level Security

- Every tenant-scoped table (`org_memberships`, `projects`, `template_responses`, `exports`, `delivery_records`, `wallets`, `credit_purchases`, `wallet_transactions`, `ai_assist_requests`) has a non-nullable, indexed `org_id` column.
- RLS is enabled on all of the above tables.
- At the start of each request's database transaction, the backend issues:
  ```sql
  SET LOCAL app.current_org_id = '<org_id>';
  ```
  where `<org_id>` is resolved server-side from the authenticated Clerk session's active org — never taken from a client-supplied parameter.
- Policy shape (applied per table):
  ```sql
  CREATE POLICY tenant_isolation ON projects
    USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
  ```
- **Platform Admin bypass:** a dedicated Postgres role (`platform_admin_role`) with `BYPASSRLS`, used *only* by the admin-panel service path. Every query executed under this role must first write a row to `admin_access_log` (org_id, admin id, reason) — enforced at the application layer, not optional. This satisfies the RBAC rule that admin content access is audit-gated, not ambient.
- **System-level bypass (no user session at all):** the same `platform_admin_role` connection is also used by `getSystemPrisma()` (`packages/db/src/index.ts`) for operations that have no user session to derive `app.current_org_id` from in the first place — currently only the Razorpay webhook handler, which must look up a `CreditPurchase` by `razorpay_order_id` before it knows which org it belongs to. This path does **not** write to `admin_access_log` (it's a system event, not an admin reading org content) — only the admin-panel usage of this role needs that audit trail.

**Second permissions gap found during Stage D:** the `enable_rls` migration granted `platform_admin_role` table-level DML privileges but never `GRANT USAGE ON SCHEMA public` — Postgres requires both, so every query under this role failed with `permission denied for schema public` until the `platform_admin_schema_usage` migration fixed it. This had gone unnoticed since Stage B because nothing had actually used `platform_admin_role` until the webhook handler became its first real caller.

**Critical detail found during Stage B, Phase 2 build:** RLS policies (even with `FORCE ROW LEVEL SECURITY`) are silently ignored for Postgres superusers and for the table owner unless a distinct role is used — Docker's default `POSTGRES_USER` is a superuser. The application's runtime connection must use a dedicated `app_role` (non-superuser, not the table-owning migration role) or RLS enforcement does nothing. Migrations run as the schema-owning role via Prisma's `directUrl`; the app's `DATABASE_URL` uses `app_role`. See the `app_role` migration and `packages/db/.env.example`.

## Layer 2 — Backend middleware (application-layer gate)

- Express middleware `tenantScope` runs immediately after Clerk auth middleware, before any route handler executes.
- Responsibilities:
  1. Resolve `org_id` from the authenticated session's active Clerk org.
  2. Reject the request (403) if no active org is set, unless the route is explicitly platform-admin-only.
  3. Open the Prisma transaction and issue `SET LOCAL app.current_org_id` as the first statement.
  4. Attach a **Prisma Client Extension** that auto-injects `where: { org_id }` (reads) and auto-sets `data.org_id` (writes) on every query against a tenant-scoped model — so tenant scoping does not depend solely on a developer remembering to filter by org.
- Any route handler that queries a tenant-scoped model via a raw Prisma client (bypassing the `tenantScope`-derived client) is treated as a defect: to be caught by a lint rule / required code-review checklist item, wired up in Stage B CI.

## Why two layers

RLS is the hard boundary — even a bug in application logic cannot leak cross-org rows, because the database itself refuses them. The middleware layer exists so that a missing `org_id` filter fails *before* hitting the database in the common case, and so the Prisma extension gives a single place to reason about tenant scoping in code review, rather than trusting every query site individually.

## Verification (feeds Stage B / Section 5 must-have #9)

The tenant-isolation automated test must, at minimum:
1. Create two orgs (A, B) each with a project.
2. Authenticate as a Member of org A.
3. Assert a direct-id fetch of org B's project returns 404/403, not the record.
4. Assert a list endpoint scoped to "my org's projects" never includes org B's rows.
5. Attempt the same reads with RLS temporarily forced off (test-only) to confirm the middleware layer *also* blocks it independently — proving defense in depth, not just one working layer.
