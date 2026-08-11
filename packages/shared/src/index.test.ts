import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, PROJECT_STATUSES } from "./index.js";

describe("shared constants", () => {
  it("defines the three export formats", () => {
    expect(EXPORT_FORMATS).toEqual(["md", "docx", "pdf"]);
  });

  it("defines the project lifecycle in order", () => {
    expect(PROJECT_STATUSES).toEqual([
      "draft",
      "in_progress",
      "ready_to_export",
      "exported",
      "delivered",
    ]);
  });
});
