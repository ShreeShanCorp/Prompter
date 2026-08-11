import { useEffect, useState } from "react";
import { describeError, type WizardFieldDefinition } from "../lib/apiClient";

function toEditableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

interface SectionEditorProps {
  field: WizardFieldDefinition;
  value: unknown;
  onSave: (parsedValue: unknown) => Promise<void>;
  onAiAssist: (roughInput: string) => Promise<string>;
}

/**
 * table/list sections are edited as raw JSON for now -- a dedicated
 * add/remove-row editor is a reasonable follow-up, not required to prove the
 * wizard works end to end (flagged in the Stage E Phase 2 plan).
 */
export function SectionEditor({ field, value, onSave, onAiAssist }: SectionEditorProps) {
  const [text, setText] = useState(() => toEditableText(value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [roughInput, setRoughInput] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setText(toEditableText(value));
  }, [value]);

  const isJsonType = field.type === "table" || field.type === "list";

  async function handleSave() {
    setError(null);
    let parsed: unknown = text;
    if (isJsonType) {
      if (!text.trim()) {
        parsed = [];
      } else {
        try {
          parsed = JSON.parse(text);
        } catch {
          setError("Invalid JSON -- fix the syntax before saving.");
          return;
        }
      }
    }
    setSaving(true);
    try {
      await onSave(parsed);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAiAssist() {
    if (!roughInput.trim()) return;
    setAiError(null);
    setDrafting(true);
    try {
      const draft = await onAiAssist(roughInput);
      setText(draft);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI-assist failed.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section className="border-b border-[var(--color-border)] py-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">
          {field.section}. {field.label}
          {field.required && <span className="text-[var(--color-danger)] ml-1">*</span>}
        </h3>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={field.type === "text" ? 2 : 5}
        placeholder={isJsonType ? "[ ... ] or { ... } (JSON)" : ""}
        className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--color-accent)]"
      />
      {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <input
          value={roughInput}
          onChange={(e) => setRoughInput(e.target.value)}
          placeholder="Rough idea for AI to draft this section..."
          className="flex-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={handleAiAssist}
          disabled={drafting || !roughInput.trim()}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
        >
          {drafting ? "Drafting..." : "Draft with AI"}
        </button>
      </div>
      {aiError && <p className="mt-1 text-xs text-[var(--color-danger)]">{aiError}</p>}
    </section>
  );
}
