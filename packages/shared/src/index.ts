export const ORG_MEMBERSHIP_ROLES = ["member", "owner"] as const;
export type OrgMembershipRole = (typeof ORG_MEMBERSHIP_ROLES)[number];

export const PLATFORM_ROLES = ["none", "platform_admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PROJECT_STATUSES = [
  "draft",
  "in_progress",
  "ready_to_export",
  "exported",
  "delivered",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const EXPORT_FORMATS = ["md", "docx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const CREDIT_SOURCES = ["free_hourly", "purchased"] as const;
export type CreditSource = (typeof CREDIT_SOURCES)[number];

export const CREDIT_PACKS = ["starter_1usd_2credits", "value_5usd_20credits"] as const;
export type CreditPack = (typeof CREDIT_PACKS)[number];

/**
 * Field-level definition for one input in the wizard. The full schema (one
 * entry per field across Sections 1-12 of SaaS-Build-Prompt-Template.md) is
 * built out in the Stage C wizard phase — this type is locked now so the
 * form renderer, validation, and completeness_pct calculation can all share
 * one data-driven definition instead of per-section hardcoded components
 * (per docs/architecture/requirements-lock.md).
 */
export interface TemplateFieldDefinition {
  id: string;
  section: number;
  label: string;
  type: "text" | "textarea" | "table" | "list";
  required: boolean;
}

export * from "./wizard-schema.js";
