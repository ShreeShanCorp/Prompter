# Prompter — Entity-Relationship Detail

Expands the Section 3 relationship sketch in `SaaS-Build-Prompt-Template.md` into field-level detail. All tenant-scoped tables carry `org_id` (see `multi-tenancy.md`).

## Org
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| name | string | |
| slug | string, unique | URL-safe identifier |
| clerk_org_id | string, unique | links to Clerk org |
| plan_tier | enum(free, paid) | denormalized cache of `Subscription.plan` for fast checks |
| status | enum(active, suspended) | set by Platform Admin |
| created_at / updated_at | timestamp | |

## Member
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| clerk_user_id | string, unique | |
| email | string | |
| name | string, nullable | |
| platform_role | enum(none, platform_admin) | global flag, independent of any org |
| created_at / updated_at | timestamp | |

## OrgMembership (Org ↔ Member join)
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| org_id | fk Org | |
| member_id | fk Member | |
| role | enum(member, owner) | per Section 2 |
| status | enum(invited, active, removed) | |
| invited_by | fk Member, nullable | |
| created_at / updated_at | timestamp | |
| — | unique(org_id, member_id) | one membership row per org/member pair |

## Project
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| org_id | fk Org | tenant key |
| created_by | fk Member | historical reference, survives member removal |
| name | string | |
| status | enum(draft, in_progress, ready_to_export, exported, delivered) | see `state-machines.md` |
| template_version | string | version of the template schema used, for future migrations |
| deleted_at | timestamp, nullable | soft delete |
| created_at / updated_at | timestamp | |

## TemplateResponse (1:1 with Project)
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| project_id | fk Project, unique | |
| org_id | fk Org | denormalized for RLS |
| section_1_identity | jsonb | |
| section_2_roles | jsonb | |
| section_3_domain_model | jsonb | |
| section_4_tech_stack | jsonb | |
| section_5_mvp_scope | jsonb | |
| section_6_nfr | jsonb | |
| section_7_integrations | jsonb | |
| section_8_ui_ux | jsonb | |
| section_9_dod | jsonb | usually template-defaulted, still editable |
| section_10_deliverables | jsonb | |
| section_11_phase_gate | jsonb | mostly defaulted (phase-size budget editable) |
| section_12_special_instructions | text | |
| completeness_pct | int, computed | drives the wizard progress bar and the `ready_to_export` gate |
| updated_at | timestamp | |

## Export
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| project_id | fk Project | |
| org_id | fk Org | |
| format | enum(md, docx, pdf) | |
| file_url | string | storage location |
| version | int | increments per export of the same project |
| generated_by | fk Member | |
| credit_source | enum(free_hourly, purchased) | which entitlement paid for this attempt — see `Wallet` |
| created_at | timestamp | |

## DeliveryRecord
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| project_id | fk Project | |
| org_id | fk Org | |
| target_tool | enum(claude_code, codex, antigravity, other) | |
| method | enum(copy, api, mcp) | `api`/`mcp` inert in v1 (Section 5 deferral), schema ready for v1.1 |
| status | enum(pending, success, failed) | |
| error_message | text, nullable | |
| initiated_by | fk Member | |
| created_at | timestamp | |

## Wallet (1:1 with Org)
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| org_id | fk Org, unique | |
| stripe_customer_id | string, nullable | created lazily on first purchase |
| balance | int | purchased credits remaining; never expires; excludes the free hourly entitlement |
| last_free_export_at | timestamp, nullable | last time the org consumed its free hourly export; null = never used |
| created_at / updated_at | timestamp | |

## CreditPurchase
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| org_id | fk Org | |
| wallet_id | fk Wallet | |
| purchased_by | fk Member | Owner-only action, see `rbac.md` |
| pack | enum(starter_1usd_2credits, value_5usd_20credits) | |
| credits_granted | int | 2 or 20 |
| amount_usd | numeric | 1.00 or 5.00 |
| stripe_payment_intent_id | string | |
| status | enum(pending, completed, failed) | balance only incremented on `completed`, via webhook |
| created_at | timestamp | |

## WalletTransaction (ledger)
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| org_id | fk Org | |
| wallet_id | fk Wallet | |
| type | enum(purchase_credit, free_export, paid_export_debit) | |
| amount | int | positive for `purchase_credit`/reflects grant, negative for debits |
| related_export_id | fk Export, nullable | set for `free_export`/`paid_export_debit` |
| related_credit_purchase_id | fk CreditPurchase, nullable | set for `purchase_credit` |
| created_at | timestamp | append-only, never updated — the audit trail for billing disputes |

## AIAssistRequest
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| project_id | fk Project | |
| org_id | fk Org | |
| member_id | fk Member | |
| section | string | which template section the request was for |
| input_text | text | |
| output_text | text | |
| model | string | e.g. `claude-sonnet-5` |
| tokens_used | int, nullable | |
| cost_usd | numeric, nullable | |
| created_at | timestamp | |

## admin_access_log (support/audit)
| Field | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| platform_admin_id | fk Member | |
| org_id | fk Org | org whose data was accessed |
| reason | text | required, freeform |
| accessed_at | timestamp | |
