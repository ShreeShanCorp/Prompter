import type { DeliveryTargetTool } from "@prompter/db";

/**
 * Wraps already-rendered markdown with a short tool-specific preamble.
 * Claude Code is the template's native voice (Section 0 already addresses
 * "You are acting as the lead full-stack engineer..."), so it needs no
 * reframing; other tools get a short adaptation note.
 */
export function tunePromptForTool(tool: DeliveryTargetTool, markdown: string): string {
  switch (tool) {
    case "claude_code":
      return markdown;
    case "codex":
      return (
        "You are Codex, an AI coding agent. Follow this phase-gated build brief exactly, " +
        "including the Phase-Gate Protocol section -- do not skip stages or write code ahead " +
        "of an approved phase.\n\n" +
        markdown
      );
    case "antigravity":
      return (
        "You are an Antigravity coding agent. Treat the following as a binding build brief: " +
        "follow every section in order, and honor the phase-gate rules exactly as written.\n\n" +
        markdown
      );
    case "other":
      return (
        "The following is a structured, phase-gated software build brief. Follow it exactly, " +
        "stage by stage, and do not expand scope beyond what each phase states.\n\n" +
        markdown
      );
  }
}
