import { REQUIRED_WIZARD_SECTION_IDS } from "@prompter/shared";

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function computeCompleteness(templateResponse: Record<string, unknown>): {
  pct: number;
  isReadyToExport: boolean;
} {
  const filledCount = REQUIRED_WIZARD_SECTION_IDS.filter((id) =>
    isFilled(templateResponse[id]),
  ).length;
  const pct = Math.round((filledCount / REQUIRED_WIZARD_SECTION_IDS.length) * 100);
  return { pct, isReadyToExport: filledCount === REQUIRED_WIZARD_SECTION_IDS.length };
}
