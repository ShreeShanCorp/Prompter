# Prompter — Feature Catalogue

Written, not illustrated with screenshots — capturing real screenshots through this session's browser automation hit the same Clerk cross-origin friction documented in the Stage D phase summaries, and wasn't worth re-litigating purely for documentation. Every feature below was verified working live during the build, not just tested in isolation — see the phase summaries in the conversation history for what was actually clicked through.

## Authentication & Organizations
Real Clerk-backed sign-up/sign-in. Prompter's tenant model requires an active organization — a signed-in user with no org selected is shown Clerk's org switcher/creation UI before reaching anything else. Member and Org records are provisioned just-in-time on first sight of a Clerk session (no webhook infrastructure needed for this).

## The Wizard
All 12 sections of `SaaS-Build-Prompt-Template.md`, rendered from one data-driven schema (`packages/shared/src/wizard-schema.ts`) rather than hardcoded per-section components — the same schema drives the form, the completeness calculation, and the `ready_to_export` validation gate. A progress bar and status badge track the project through Draft → In Progress → Ready to Export automatically as required sections are filled.

**AI-assist:** each section has a "Draft with AI" affordance — type a rough idea, get a Claude-drafted answer to review and edit before saving. Rate-limited to 20 requests/hour/org (the only endpoint with unmetered external cost). Gracefully disables itself (not a broken button) if no Anthropic key is configured.

*Known limitation:* table/list sections (roles, tech stack, integrations) are edited as raw JSON, not a dedicated row-editor UI.

## Export
Generate `.md`, `.docx`, or `.pdf` once every required section is filled. Each generation consumes one wallet credit — the free hourly entitlement first, then the purchased balance, atomically (verified concurrency-safe, not just asserted). Every export is downloadable and versioned; history is kept per project.

## Copy for AI Tool
Once a project has been exported at least once, its content can be tuned and copied for Claude Code, Codex, Antigravity, or a generic "other" target — each with a different framing preamble. Free (doesn't consume a credit, unlike export). Copies straight to the clipboard.

## Billing (Wallet & Credits)
Pay-per-export, not a subscription: every org gets one free export per rolling hour (non-stacking), plus purchasable credit packs (₹99 for 2 credits, ₹449 for 20) via Razorpay — chosen over Stripe specifically because Stripe doesn't support India-based merchants. Purchases are Owner-only. The webhook that credits a wallet on payment is idempotent (redelivery-safe) and signature-verified with real HMAC-SHA256, not mocked. A payment receipt email is sent via Resend (falls back to a logged-not-sent message if no key is configured).

## Admin Panel
Platform admins (a role with no self-service grant path, by design) can see every org in the system with usage stats, suspend or reactivate any org, and change the product's rename-point setting. Suspending an org is enforced, not cosmetic — it immediately blocks writes (`423 Locked`) for every member of that org until reactivated.

## Multi-Tenancy & Security
Every tenant-scoped table is protected by Postgres Row-Level Security *and* an independent application-layer filter (a Prisma extension) — proven via an automated test that two orgs genuinely cannot read or write each other's data, at both layers independently, even with a deliberately unscoped raw SQL query. Found and fixed two real gaps along the way: Postgres superusers silently bypass RLS (Docker's default user is one), and a role missing `GRANT USAGE ON SCHEMA` fails with no obvious error until actually used.

## What's Explicitly Not Built
- **R2 file storage** — deferred by explicit choice; exports use local disk (swappable via the `ExportStorage` interface with no route changes).
- **Direct API/MCP delivery** to AI tools — only copy-to-clipboard exists; both were named as v1.1/v2 scope from the start.
- **Per-member suspension**, **billing intervention tools**, **audit log viewer** — see `docs/admin-guide.md` for the full list of what the admin panel deliberately doesn't do yet.
- **Playwright E2E tests** and **real load testing** — flagged as open items in `docs/runbook.md`, not silently skipped.
