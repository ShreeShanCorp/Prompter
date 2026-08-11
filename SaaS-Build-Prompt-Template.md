# SaaS Product Build — Master Prompt Template (Phase-Gated)

## 0. Role & Operating Mode

You are acting as the lead full-stack engineer and technical architect for a new SaaS product. You will build this product **stage-by-stage and phase-by-phase**, following the Phase-Gate Protocol in Section 11 without exception. You do not skip ahead, you do not silently expand scope, and you do not mark a phase complete until its Definition of Done (Section 9) is fully satisfied.

---

## 1. Product Identity & Positioning

- **Product name:** `Prompter`
- **Rename point required?** `YES — centralize the name in a single config/constants file and admin-panel setting so it can be renamed later without a code-wide find/replace`
- **One-line positioning statement:** `The structured intake tool that turns a vague product idea into a rigorous, phase-gated build prompt for AI coding agents.`
- **Target user segment:** `Solo developers/founders building with AI coding agents (Claude Code, Codex, etc.), and agencies/consultancies running repeatable client SaaS builds.`
- **Core pain point being solved:** `AI coding agents given vague, underspecified prompts invent requirements, silently expand scope, and produce incomplete/incorrect builds. Users also have no repeatable process for capturing all the sections a build brief needs (roles, domain model, NFRs, etc.), so they reinvent it — and miss things — every time.`

## 2. Users, Roles & Permission Model

| Role | Can see | Can do | Explicitly cannot do |
|---|---|---|---|
| `Member` (org user) | Own org's projects/templates, own exports/history | Create/edit/delete templates within their org, run AI-assist, export (.md/.docx/.pdf), copy tuned-per-tool output, manage own profile | Manage org billing, invite/remove org members, change org plan, access other orgs' data |
| `Org Owner/Admin` | Everything a Member sees, plus org billing, member list, org settings | Everything a Member can do, plus invite/remove/role-change org members, purchase credit packs (Razorpay), set org-level defaults | Access other orgs' data, access platform admin panel |
| `Platform Admin` | All orgs (metadata/usage, not private template content by default), platform-wide usage/billing status, support tooling | Manage user/org accounts (suspend, support actions), view platform analytics, manage the product-name rename-point config, manage plan/pricing config | Arbitrarily read a private org's template content without an explicit support/audit reason (logged access only) |

> Note: no anonymous/free-tier public role in v1 — an account (and org) is required to use the wizard, since usage is metered against a plan (Section 5).

## 3. Core Domain Model

- **Entities & relationships:**
  ```
  Org 1---* Member (via OrgMembership, carries Role)
  Org 1---* Project
  Project 1---1 TemplateResponse   (the filled-in Section 1-12 answers)
  Project 1---* Export              (.md / .docx / .pdf artifacts, versioned)
  Project 1---* DeliveryRecord       (per-tool copy/API/MCP delivery attempts + status)
  Org 1---1 Wallet                  (purchased-credit balance, free-export entitlement tracking)
  Org 1---* CreditPurchase (Razorpay) (one-time credit-pack payments)
  Org 1---* WalletTransaction        (ledger: purchases, free grants, export debits)
  Member 1---* AIAssistRequest       (LLM calls made while filling a section, for audit/cost tracking)
  ```
- **Key business workflows as explicit state machines, including hard gates:**
  ```
  Project: Draft -> InProgress -> ReadyToExport -> Exported -> Delivered
  Hard gates:
    - "ReadyToExport" cannot be reached while any required template field (Sections 1-8, 10) is empty —
      validation mirrors the "every row must be filled" rule from Section 2 of this template.
    - "Delivered" (via API/MCP integration) cannot happen before at least one successful Export exists.
    - An Export cannot be generated (an "attempt") unless the org has either an unused free hourly
      export entitlement or a positive purchased-credit balance — see the Wallet/Credit model in
      Section 4.
  ```

## 4. Tech Stack (Pinned — Not "Latest" or "Modern")

| Layer | Choice + version |
|---|---|
| Frontend framework | React 19.x + TypeScript 5.x |
| Build tool | Vite 6.x |
| Styling / UI kit | Tailwind CSS v4 + Shadcn UI |
| State/data layer | TanStack Query 5.x, Zustand 5.x |
| Backend framework | Express 5.x (Node 22 LTS) + TypeScript 5.x |
| Database | PostgreSQL 16 |
| ORM | Prisma 6.x |
| Cache | Redis 7.x |
| Queue | BullMQ (for async export generation and AI-assist calls) |
| Auth | Clerk (org/team support built in) |
| Payments | Razorpay (one-time payments for credit packs — pay-per-export credit/wallet model, not recurring subscriptions; India-compatible, per Stage D revision) |
| AI-assist LLM | Anthropic Claude API (Claude Sonnet family) |
| Hosting / CI-CD | Vercel (frontend) + Railway (backend + Postgres + Redis), GitHub Actions |
| Testing | Vitest + Playwright |
| Observability | Sentry + Railway/Vercel built-in logs (Grafana/Prometheus deferred until scale requires it) |

- **Multi-tenancy strategy:** `Shared schema with org_id (tenant) foreign key on every tenant-scoped table, enforced via Postgres Row-Level Security policies keyed on org_id, plus an org-scoped middleware layer in the backend as a second enforcement point (defense in depth). Chosen over schema-per-tenant because org count is expected to be moderate (hundreds–low thousands) and RLS keeps operational complexity (migrations, backups) low while still giving a strong isolation guarantee.`

## 5. MVP Scope Boundary

- **Must-have for v1:**
  1. Auth + org/team accounts (Clerk): sign up, org creation, invite members, role assignment (Member/Owner).
  2. Structured form wizard covering every section of `SaaS-Build-Prompt-Template.md` (Sections 1–12), with validation that blocks export while required fields are empty.
  3. Optional AI-assist per section: "help me draft this" button that calls the Claude API with the user's free-text input and suggests a filled answer the user can edit before accepting.
  4. Project save/edit/versioning (Draft → InProgress → ReadyToExport state machine).
  5. Export to `.md`, `.docx`, and `.pdf`.
  6. "Copy for [tool]" tuned-output buttons for Claude Code, Codex, Antigravity, and a generic "other AI tool" format.
  7. Razorpay billing: pay-per-export credit/wallet model — each org gets 1 free export per rolling 1-hour window (non-stacking, use-it-or-lose-it); beyond that, Owners buy credit packs ($1 = 2 credits, $5 = 20 credits) that never expire and are spent 1-per-export with no additional rate cap.
  8. Platform Admin panel: user/org list, suspend/reactivate, basic usage view, rename-point config for the product name.
  9. Tenant-isolation automated test proving one org cannot read/write another org's data.
- **Explicitly deferred to v2+:**
  1. Direct API integration that programmatically starts a Claude Code / Codex session from within Prompter.
  2. MCP server / CLI plugin so MCP-compatible tools can pull a generated prompt directly into a live session.
  3. Template library/marketplace (sharing reusable templates across orgs or publicly).
  4. Fine-grained per-seat billing / usage-based pricing beyond flat free/paid tiers.
- **Cut line:** Anything not listed above as must-have is out of scope for this build unless a phase-gate discussion explicitly adds it.

## 6. Non-Functional Requirements

- **Security / compliance bar:** Tenant-isolation proof required via automated test (Section 5, must-have #9); standard global hosting (no data-residency constraint); OWASP Top-10 pass; no secrets/keys hardcoded, all sensitive config env-driven; Clerk/Razorpay webhook signatures verified.
- **Scale target:** Designed for 500 orgs / a few thousand end users at launch, architected to 10x without re-architecture (RLS + indexed org_id keeps this straightforward).
- **Test coverage expectation:** All critical paths (auth, org isolation, wizard save/validate, export generation, Razorpay webhook handling) covered by Vitest (unit/integration) and Playwright (E2E wizard-to-export flow); tests must pass, not merely exist; CI blocks merge on failure.

## 7. Integrations

| Service | Purpose | Fallback if key/credential missing |
|---|---|---|
| Clerk | Auth, org/team management | Dev mode blocks sign-in with a clear config-error screen; never silently allow unauthenticated access |
| Razorpay | Credit-pack purchases (pay-per-export wallet model) | Dev mode: purchase buttons disabled with a "billing not configured" message, wallet still usable via the free hourly entitlement |
| Anthropic Claude API | AI-assist drafting per wizard section | AI-assist button is disabled/hidden with a tooltip explaining it's unavailable; manual form-fill still fully works |
| Resend (or similar) transactional email | Org invite emails, billing notifications | Dev mode: log email payload to console/log instead of sending, clearly marked as not delivered |

## 8. UI/UX Reference

- **Named reference product(s):** `Linear` — match its information density, fast keyboard-friendly navigation, and minimal-chrome aesthetic for the wizard and dashboard views.
- **Design tokens / brand constraints (if any):** `None fixed yet — use a neutral dark/light theme consistent with Linear's visual language as a starting point; refine once brand assets exist.`

## 9. Definition of Done (applies to every phase)

A phase is **not complete** until all of the following are true:
1. Code builds with zero errors (`npm run build` in each workspace).
2. Type-check passes with zero errors (`npm run typecheck`).
3. All tests for the phase pass (`npm run test` / `npm run test:e2e`) — tests must exist **and** pass.
4. No secrets/keys are hardcoded; all sensitive config is environment-driven.
5. A short phase-summary is produced (what was built, what was deferred, any deviations from this prompt and why).

## 10. Deliverables & Format

- **End-of-project artifacts required:** Operator runbook, API docs, seed data/fixtures, illustrated feature catalogue, admin setup guide.
- **File formats required:** `.md`, `.pdf`, `.docx`, OpenAPI/Swagger JSON for the API.

## 11. Phase-Gate Protocol (Mandatory — No Exceptions)

Break the build into **stages**, each containing one or more **phases**, sized to roughly 60–90 minutes of Claude Code usage per phase.

- **Stage A — Discovery & Architecture:** requirements lock, ERD, RBAC design, multi-tenancy decision, state-machine designs. **No code written in this stage.**
- **Stage B — Foundations:** repo scaffold, CI/CD skeleton, auth, tenant-isolation proof, core schema/migrations.
- **Stage C — Core Domain Build:** the entities and workflows from Section 3, phase by phase, following the MVP boundary in Section 5.
- **Stage D — Integrations:** each third-party service from Section 7, one phase per integration, each with its fallback implemented and tested.
- **Stage E — Frontend Build:** UI shell → core screens → role-based views, matching Section 8 reference.
- **Stage F — Hardening:** non-functional requirements from Section 6, security pass, load/scale check, test-coverage close-out.
- **Stage G — Deliverables & Handover:** artifacts from Section 10.

**Rules for every phase, without exception:**
1. Before starting a phase, state its scope, the files/modules it will touch, and its Definition of Done from Section 9.
2. Build only what that phase's stated scope covers — no silent scope expansion into a later phase.
3. On completion, run the Definition-of-Done checks and report the results (pass/fail per check, not "looks good").
4. **Stop and wait for explicit confirmation before starting the next phase.** Do not proceed on an assumed "yes." Acceptable confirmations are an explicit "approved," "proceed," or "go ahead" — silence, an unrelated question, or a partial comment is not approval.
5. If a phase reveals that an earlier decision (schema, tech choice, role model) needs to change, stop, flag the conflict, and get explicit direction before continuing — do not quietly patch around it.
6. Track cumulative "nearness to deliverable" — at each gate, restate what fraction of Section 5's must-have list is complete.

## 12. Special Instructions & Considerations

Direct API integration (Claude API session kickoff) and the MCP server/CLI plugin are deferred to v1.1/v2 per Section 5 — do not build these during the v1 phase sequence even if convenient; they are explicitly out of scope until v1 ships. This document (`SaaS-Build-Prompt-Template.md`) is itself the reusable output format Prompter generates for other users — Prompter's own build should keep this file as the canonical template and must not couple its code to a hardcoded copy of these questions where a data-driven form schema would do instead.

---

**Begin with Stage A, Phase 1 only. Present your Phase 1 plan and wait for approval before writing any code.**
