# Prompter — Operator Runbook

Everything needed to run, develop, and eventually deploy Prompter. For *why* things are built this way, see `docs/architecture/`.

## 1. Local development setup

### Prerequisites
- Node.js 22+
- Docker Desktop (for local Postgres + Redis)
- npm (workspaces-based monorepo — no pnpm/yarn)

### First-time setup

```bash
npm install
docker compose up -d          # starts Postgres (port 5433) and Redis (port 6379)
```

Postgres is mapped to **5433**, not the default 5432 — this avoids clashing with any native Postgres already running on your machine.

### Database roles (read this before anything DB-related is confusing)

The app never connects to Postgres as the superuser. Three roles exist:

| Role | Used for | Why |
|---|---|---|
| `prompter` (superuser, created by `docker-compose.yml`) | Running migrations only | Migrations need DDL privileges |
| `app_role` | All normal request-serving traffic | **Must** be non-superuser for Row-Level Security to actually apply — see `docs/architecture/multi-tenancy.md` for why this bit us once |
| `platform_admin_role` | Cross-org admin queries + the Razorpay webhook (`getSystemPrisma()`) | `BYPASSRLS`, used only for genuinely system-level or audit-gated operations |

After first bringing up Postgres, set passwords for the non-superuser roles (they have none by default — intentional, so nothing works until you set them):

```bash
docker exec <postgres-container> psql -U prompter -d prompter -c "ALTER ROLE app_role WITH PASSWORD 'your-local-password';"
docker exec <postgres-container> psql -U prompter -d prompter -c "ALTER ROLE platform_admin_role WITH PASSWORD 'your-local-password';"
```

### Environment files

Copy each `.env.example` to `.env` in the same directory and fill in values:

- `packages/db/.env` — `DATABASE_URL` (app_role), `DIRECT_DATABASE_URL` (prompter superuser), `SYSTEM_DATABASE_URL` (platform_admin_role)
- `apps/api/.env` — same three DB URLs, plus `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`
- `apps/web/.env` — `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`

**Every external integration has a documented no-key fallback** (Section 7 of `SaaS-Build-Prompt-Template.md`) — the app runs and is usable with zero external keys configured except Clerk (auth is not optional; without `CLERK_SECRET_KEY`, a `devTenantScope` bypass activates instead — loud console warning, single fixed demo org/user, never active once the key is set).

### Migrations

```bash
npm run migrate:dev --workspace @prompter/db     # interactive, for schema changes
npm run migrate:deploy --workspace @prompter/db  # non-interactive, applies pending migrations (CI/prod)
npm run generate --workspace @prompter/db        # regenerate the Prisma client after schema changes
```

### Running the app

```bash
npm run dev --workspace @prompter/api   # API on :3001
npm run dev --workspace @prompter/web   # web app on :5173
```

### Running checks

```bash
npm run build        # all workspaces
npm run typecheck     # all workspaces
npm run lint
npm run test          # includes real integration tests against the live local Postgres --
                       # Postgres must be running (docker compose up -d) before this will pass
```

## 2. Architecture at a glance

- **Monorepo:** `apps/api` (Express 5), `apps/web` (React 19 + Vite), `packages/db` (Prisma + Postgres), `packages/shared` (types + wizard schema).
- **Multi-tenancy:** shared schema, `org_id` on every tenant table, enforced by Postgres RLS *and* an application-layer Prisma extension (defense in depth) — see `docs/architecture/multi-tenancy.md`.
- **Billing:** pay-per-export credit/wallet model (not subscriptions) via Razorpay — see `docs/architecture/state-machines.md`.
- **Auth:** Clerk, with just-in-time provisioning (Member/Org/OrgMembership created on first sight of a Clerk session, since no webhook infra is wired up yet — see `tenantScope.ts`).

## 3. CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`: lint → migrate deploy → typecheck → build → test, against a real ephemeral Postgres service container. No deployment step exists yet — this repo has never been deployed to a real host.

## 4. Known operational gaps (read before deploying for real)

These are documented trade-offs, not oversights — see the referenced docs for the reasoning:

- **PDF generation is synchronous** (Puppeteer launches per request, ~5-9s). Was designed for a BullMQ background job; simplified for MVP. Revisit if this proves too slow in practice (`docs/architecture/requirements-lock.md`).
- **AI-assist rate limiting is in-memory** (20/hour/org) — works for a single API instance, will not share state across horizontally-scaled instances. Move to a Redis-backed store before scaling out (`apps/api/src/middleware/aiAssistRateLimit.ts`).
- **Export storage is local disk** (`.local-exports/` on the API server's own filesystem) — R2 integration was deferred by explicit choice, no credentials provided this build. Swapping in `R2ExportStorage` requires no route changes (`ExportStorage` interface).
- **No real webhook infra for Clerk** — org/member sync happens on-request instead (works, but has no way to react to org deletion, member removal from Clerk's side, etc. until that member/org is next seen in a request).
- **No Playwright E2E tests** — only integration tests (supertest against a live Postgres) exist; no full browser-driven test suite.
- **No load-testing was performed** — indexes were added for known query patterns, but nothing here validates actual throughput at scale.

## 5. Emergency operations

- **Suspend an org:** Admin panel → Organizations → Suspend. Immediately blocks all writes for that org (reads still work) — see `tenantScope.ts`'s `org_suspended` check.
- **Rename the product:** Admin panel → "Product name (rename point)". Takes effect immediately, no redeploy (stored in `platform_settings` table, not an env var).
- **Grant platform admin:** no self-service UI by design — set `Member.platformRole = 'platform_admin'` directly in the database for the target user's row.
