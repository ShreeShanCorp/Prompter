import type { ProjectStatus } from "@prompter/shared";

/**
 * Implements the Project state machine transitions triggered by a template
 * edit, per docs/architecture/state-machines.md. Export/delivery-triggered
 * transitions (ReadyToExport -> Exported -> Delivered) live wherever those
 * actions are implemented, not here.
 */
export function nextStatusAfterTemplateEdit(
  currentStatus: ProjectStatus,
  isReadyToExport: boolean,
): ProjectStatus {
  if (currentStatus === "exported" || currentStatus === "delivered") {
    // Editing a required field after export/delivery invalidates it -- forces
    // re-validation before the project can be marked exported again, even if
    // the edit happens to leave every required section still filled.
    return "in_progress";
  }
  // Covers Draft/InProgress/ReadyToExport alike: status always reflects
  // current completeness, not the literal prior state. A single save that
  // fills every required section goes straight from Draft to ReadyToExport.
  return isReadyToExport ? "ready_to_export" : "in_progress";
}

/**
 * ReadyToExport -> Exported hard gate: an export can only be generated once
 * every required section is filled. Re-exporting from Exported/Delivered is
 * also allowed (Exported -> Exported, and a fresh export while Delivered
 * moves back to Exported since the newest artifact hasn't been delivered
 * yet -- see docs/architecture/state-machines.md).
 */
export function canGenerateExport(status: ProjectStatus): boolean {
  return status === "ready_to_export" || status === "exported" || status === "delivered";
}

/**
 * Exported -> Delivered hard gate: delivery requires at least one successful
 * Export already exists, which "exported" or "delivered" status guarantees
 * (ready_to_export does not -- no export has succeeded yet).
 */
export function canDeliver(status: ProjectStatus): boolean {
  return status === "exported" || status === "delivered";
}
