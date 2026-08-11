# Prompter — Stage A Requirements Lock

Consolidates `SaaS-Build-Prompt-Template.md` plus `erd.md`, `rbac.md`, `state-machines.md`, `multi-tenancy.md` into one frozen baseline for Stage B. Anything not decided here is out of scope until a phase-gate discussion reopens it (per Section 11, rule 5).

## Billing model (superseding the original Section 4/7 subscription framing)

Locked in this phase, replacing the earlier Stripe-subscription design:
- **Unit of consumption ("attempt") = one export generation** (.md/.docx/.pdf) — not AI-assist calls, not project creation.
- **Free entitlement:** 1 free export per rolling 1-hour window per org, non-stacking (unused hours are not banked).
- **Purchased credits:** $1 = 2 credits, $5 = 20 credits, one-time Stripe payments, never expire, no additional rate cap beyond the balance itself.
- **Resolution order and concurrency handling:** see `state-machines.md` → "Wallet / Credit lifecycle."
- **Entities:** `Wallet`, `CreditPurchase`, `WalletTransaction` (replacing the originally-sketched `Subscription` entity) — see `erd.md`.
- **RBAC:** any Member/Owner can trigger an export (spending a credit); only an Owner can purchase a credit pack — see `rbac.md`.

This was flagged mid-phase as a conflict with the original Stripe-subscription plan in Section 4 (protocol rule 5) and resolved with you before proceeding; `SaaS-Build-Prompt-Template.md` Sections 3, 4, and 5 have been updated to match.

## Remaining implementation decisions (architect's call, technical rather than product-level)

| Decision | Choice | Rationale |
|---|---|---|
| Export file storage | Cloudflare R2 (S3-compatible) | Backend is Railway-hosted, not Vercel-only — R2 keeps storage host-independent and avoids coupling to one PaaS's blob product; S3-compatible API means no vendor-specific SDK lock-in. |
| .docx generation | `docx` (npm, dolanmiu/docx) | Pure JS/TS, no native binary dependency, generates from the same structured `TemplateResponse` data used for `.md` — avoids a second templating format to maintain. |
| .pdf generation | Puppeteer rendering a shared HTML template to PDF | Reuses one HTML/CSS template for visual output instead of a third bespoke renderer. **Revised during Stage C, Phase 3:** generated synchronously in the request/response cycle for now, not via BullMQ -- avoids building job-queue infrastructure (enqueue, status polling, worker process) before there's evidence PDF generation is slow enough to need it. Revisit async if this proves too slow in practice; the BullMQ dependency stays in the stack for that future need and for AI-assist call queuing. |
| Transactional email | Resend | Confirmed from the Section 7 placeholder — simple API, good deliverability, generous free tier for org-invite and billing-receipt emails. |
| Wizard form schema | Data-driven JSON schema (field defs: type, label, validation, section) checked into the codebase, not hardcoded per-section UI components | Directly satisfies the Section 12 instruction not to couple Prompter's code to a hardcoded copy of the template's questions — the same schema drives form rendering, validation, and `completeness_pct` calculation, and can evolve if `SaaS-Build-Prompt-Template.md` itself gains a new section later. |

## Stage A completeness check

- [x] Requirements lock (this document)
- [x] ERD (`erd.md`)
- [x] RBAC design (`rbac.md`)
- [x] Multi-tenancy decision (`multi-tenancy.md`)
- [x] State-machine designs (`state-machines.md`)
- [x] No code written during Stage A

**Stage A is complete.** Stage B (Foundations: repo scaffold, CI/CD skeleton, auth, tenant-isolation proof, core schema/migrations) is next and is the first stage that writes code.
