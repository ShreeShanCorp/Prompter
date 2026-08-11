# Prompter — Admin Setup Guide

## Granting platform admin access

There is no self-service way to become a platform admin — this is intentional (see `docs/architecture/rbac.md`: platform admin is the highest-privilege role in the system and should never be grantable through the product itself).

To grant it:

1. The target user must have signed in at least once (so a `Member` row exists for them).
2. Update their row directly:

```sql
UPDATE members SET platform_role = 'platform_admin' WHERE email = 'the-persons-email@example.com';
```

Or via Prisma, from a one-off script:

```ts
await prisma.member.update({
  where: { id: memberId },
  data: { platformRole: "platform_admin" },
});
```

3. They'll see an "Admin" link appear in the sidebar the next time the app loads (`GET /admin/whoami` drives this — see `apps/web/src/components/Layout.tsx`).

**Revoking access** is the same in reverse (`platformRole: "none"`).

## What the admin panel can do

Reachable at `/admin` — note this route deliberately bypasses the normal "select an organization" requirement, since a platform admin may not belong to any org themselves.

| Feature | What it does |
|---|---|
| **Organization list** | Every org in the system, with member count, project count, and wallet balance — for support/triage, not billing management. |
| **Suspend / Reactivate** | Suspending an org makes it **read-only** immediately — all writes from that org's members return `423 Locked` until reactivated. Reads still work. This is enforced in `tenantScope.ts`, not just a cosmetic flag. |
| **Product name (rename point)** | Changes the value returned by `GET /admin/platform-settings/product-name`. Note: **this does not currently propagate into the UI's hardcoded "Prompter" branding** — the setting exists and persists, but no frontend component reads it yet. Wiring that up is a follow-up, not done in this build. |

## What it deliberately does not do (yet)

- **No per-member suspension** — only org-level suspend/reactivate exists. The schema doesn't model individual member status beyond their per-org `OrgMembership.status` (`invited`/`active`/`removed`).
- **No billing/plan management from the admin panel** — Owners manage their own org's credit purchases; admins can only see the resulting wallet balance, not intervene in it (no "grant free credits" tool, for example).
- **No audit log viewer UI** — `admin_access_log` exists in the schema for the audit-gated support-read path (reading a specific org's private project content), but no route in this build actually reads org content that way, so the table has no writer or viewer yet.

## Troubleshooting

- **"You don't have access to the admin panel"** — the signed-in user's `Member.platformRole` isn't `platform_admin`. Confirm via the DB directly; there's no in-app way to check.
- **Admin routes return `503 system_db_not_configured`** — `SYSTEM_DATABASE_URL` isn't set in the API's environment. This is the `platform_admin_role` connection (see `docs/runbook.md` § Database roles) — admin routes and the Razorpay webhook both depend on it.
