# Prompter — RBAC Permission Matrix

Expands the Section 2 role table into an action-level matrix. `Member` and `Owner` are `OrgMembership.role` values, scoped to one org. `Platform Admin` is `Member.platform_role`, global and org-independent. Every action not listed is denied by default.

| Action | Member | Owner | Platform Admin |
|---|---|---|---|
| **Org** | | | |
| View own org settings | ✅ | ✅ | ✅ (any org, logged) |
| Update org settings (name, slug) | ❌ | ✅ | ✅ (logged) |
| Invite member | ❌ | ✅ | ❌ |
| Remove member | ❌ | ✅ | ❌ |
| Change member role | ❌ | ✅ | ❌ |
| View wallet balance / transaction history | ✅ (own org) | ✅ | ✅ (read-only, logged) |
| Purchase credit pack (Razorpay) | ❌ | ✅ | ❌ |
| Suspend/reactivate org | ❌ | ❌ | ✅ |
| View org usage (project/export counts) | ✅ (own org) | ✅ | ✅ (any org) |
| **Project** | | | |
| Create project | ✅ | ✅ | ❌ (admins don't operate as org members) |
| View project (own org) | ✅ | ✅ | ❌ (see below — content is audit-gated) |
| Edit project / template fields | ✅ | ✅ | ❌ |
| Delete project (soft delete) | ✅ (own or any in org) | ✅ | ❌ |
| View project content, any org | ❌ | ❌ | ✅, only via audit-logged support access (writes `admin_access_log` row with reason) |
| **TemplateResponse** | | | |
| Edit template fields | ✅ | ✅ | ❌ |
| Trigger AI-assist | ✅ (subject to plan/usage limits) | ✅ | ❌ |
| **Export** | | | |
| Generate export (.md/.docx/.pdf) | ✅ | ✅ | ❌ |
| View export history | ✅ (own org) | ✅ | ❌ |
| Download export | ✅ (own org) | ✅ | ❌ |
| **DeliveryRecord** | | | |
| Initiate delivery (copy/api/mcp) | ✅ | ✅ | ❌ |
| View delivery history | ✅ (own org) | ✅ | ❌ |
| **Platform Admin** | | | |
| Manage user/org accounts (suspend, support actions) | ❌ | ❌ | ✅ |
| View platform-wide analytics | ❌ | ❌ | ✅ |
| Manage product rename-point config | ❌ | ❌ | ✅ |
| Manage plan/pricing config | ❌ | ❌ | ✅ |

## Notes
- **Generating an export consumes a credit** (free hourly entitlement or purchased balance — see `state-machines.md`) regardless of whether the acting role is Member or Owner; only *purchasing* more credits is Owner-gated, matching the existing "manage billing" restriction.
- **Member vs Owner** differ only on org-administrative actions (billing, membership, org settings) — both have full read/write on Project/TemplateResponse/Export/DeliveryRecord within their org, matching Section 2's "Can do" column (no per-project ownership restriction was requested).
- **Platform Admin never gets ambient access to project content.** Every content read outside the admin's own org must go through the audit-logged support path (`admin_access_log`), satisfying the Section 2 constraint: *"cannot arbitrarily read a private org's template content without an explicit support/audit reason."*
- **Enforcement is two-layer**, matching `multi-tenancy.md`: Postgres RLS as the hard boundary, backend middleware permission checks (role + org match) as the application-layer gate before a query is even issued.
