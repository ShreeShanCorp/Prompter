import type { TemplateFieldDefinition } from "./index.js";

/**
 * One entry per section of SaaS-Build-Prompt-Template.md. Each `id` matches
 * the corresponding @prompter/db TemplateResponse field name exactly, so the
 * same schema drives the wizard UI, the API's completeness calculation, and
 * the ready_to_export gate without hardcoding section knowledge in more than
 * one place (per docs/architecture/requirements-lock.md).
 *
 * Sections store semi-structured content (tables/lists of arbitrary length),
 * so "required" here is checked at section granularity -- the section must
 * have non-empty content -- not per sub-field within it.
 */
export const WIZARD_SECTIONS: TemplateFieldDefinition[] = [
  {
    id: "sectionIdentity",
    section: 1,
    label: "Product Identity & Positioning",
    type: "text",
    required: true,
  },
  {
    id: "sectionRoles",
    section: 2,
    label: "Users, Roles & Permission Model",
    type: "table",
    required: true,
  },
  {
    id: "sectionDomainModel",
    section: 3,
    label: "Core Domain Model",
    type: "textarea",
    required: true,
  },
  {
    id: "sectionTechStack",
    section: 4,
    label: "Tech Stack (Pinned)",
    type: "table",
    required: true,
  },
  {
    id: "sectionMvpScope",
    section: 5,
    label: "MVP Scope Boundary",
    type: "list",
    required: true,
  },
  {
    id: "sectionNfr",
    section: 6,
    label: "Non-Functional Requirements",
    type: "textarea",
    required: true,
  },
  {
    id: "sectionIntegrations",
    section: 7,
    label: "Integrations",
    type: "table",
    required: true,
  },
  {
    id: "sectionUiUx",
    section: 8,
    label: "UI/UX Reference",
    type: "textarea",
    required: true,
  },
  {
    id: "sectionDod",
    section: 9,
    label: "Definition of Done",
    type: "list",
    required: false,
  },
  {
    id: "sectionDeliverables",
    section: 10,
    label: "Deliverables & Format",
    type: "textarea",
    required: true,
  },
  {
    id: "sectionPhaseGate",
    section: 11,
    label: "Phase-Gate Protocol",
    type: "textarea",
    required: false,
  },
  {
    id: "sectionSpecialInstructions",
    section: 12,
    label: "Special Instructions & Considerations",
    type: "textarea",
    required: false,
  },
];

export const REQUIRED_WIZARD_SECTION_IDS = WIZARD_SECTIONS.filter((f) => f.required).map(
  (f) => f.id,
);
