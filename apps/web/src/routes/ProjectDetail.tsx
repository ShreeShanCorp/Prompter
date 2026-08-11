import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  api,
  describeError,
  type DeliveryTargetTool,
  type ExportFormat,
  type ProjectStatus,
} from "../lib/apiClient";
import { SectionEditor } from "../components/SectionEditor";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  ready_to_export: "Ready to export",
  exported: "Exported",
  delivered: "Delivered",
};

const EXPORT_FORMATS: ExportFormat[] = ["md", "docx", "pdf"];
const DELIVERY_TOOLS: DeliveryTargetTool[] = ["claude_code", "codex", "antigravity", "other"];
const DELIVERY_LABEL: Record<DeliveryTargetTool, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  antigravity: "Antigravity",
  other: "Other AI tool",
};

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [exportError, setExportError] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.getProject(id!),
    enabled: !!id,
  });
  const schemaQuery = useQuery({ queryKey: ["wizard-schema"], queryFn: api.getWizardSchema });
  const exportsQuery = useQuery({
    queryKey: ["exports", id],
    queryFn: () => api.listExports(id!),
    enabled: !!id,
  });
  const deliveriesQuery = useQuery({
    queryKey: ["deliveries", id],
    queryFn: () => api.listDeliveries(id!),
    enabled: !!id,
  });

  const saveMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.saveTemplate(id!, updates),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project", id] }),
  });

  const exportMutation = useMutation({
    mutationFn: (format: ExportFormat) => api.generateExport(id!, format),
    onSuccess: () => {
      setExportError(null);
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
      void queryClient.invalidateQueries({ queryKey: ["exports", id] });
    },
    onError: (err) => setExportError(describeError(err)),
  });

  const deliverMutation = useMutation({
    mutationFn: (tool: DeliveryTargetTool) => api.deliver(id!, tool),
    onSuccess: async (result) => {
      await navigator.clipboard.writeText(result.content).catch(() => {});
      setDeliveryMessage(`Copied ${DELIVERY_LABEL[result.delivery.targetTool]} prompt to clipboard.`);
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
      void queryClient.invalidateQueries({ queryKey: ["deliveries", id] });
    },
    onError: (err) => setDeliveryMessage(describeError(err)),
  });

  if (!projectQuery.data || !schemaQuery.data) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10">
        <Link to="/" className="text-sm text-[var(--color-text-muted)] hover:underline">
          ← Projects
        </Link>
        {projectQuery.isLoading && (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">Loading...</p>
        )}
        {projectQuery.isError && (
          <p className="mt-4 text-sm text-[var(--color-danger)]">Failed to load project.</p>
        )}
      </div>
    );
  }

  const project = projectQuery.data;
  const templateResponse = project.templateResponse;
  const canExport = ["ready_to_export", "exported", "delivered"].includes(project.status);
  const canDeliver = ["exported", "delivered"].includes(project.status);

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <Link to="/" className="text-sm text-[var(--color-text-muted)] hover:underline">
        ← Projects
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <span className="rounded-full bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-accent)]">
          {STATUS_LABEL[project.status]}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/5">
          <div
            className="h-1.5 rounded-full bg-[var(--color-accent)]"
            style={{ width: `${templateResponse.completenessPct}%` }}
          />
        </div>
        <span className="text-xs text-[var(--color-text-muted)] w-10 text-right">
          {templateResponse.completenessPct}%
        </span>
      </div>

      <div className="mt-8">
        {schemaQuery.data.sections.map((field) => (
          <SectionEditor
            key={field.id}
            field={field}
            value={templateResponse[field.id]}
            onSave={async (parsedValue) => {
              await saveMutation.mutateAsync({ [field.id]: parsedValue });
            }}
            onAiAssist={async (roughInput) => {
              const result = await api.aiAssist(id!, field.id, roughInput);
              return result.outputText;
            }}
          />
        ))}
      </div>

      <div className="mt-8 border-t border-[var(--color-border)] pt-6">
        <h2 className="text-sm font-semibold mb-3">Export</h2>
        {!canExport && (
          <p className="text-xs text-[var(--color-text-muted)] mb-2">
            Fill every required section (marked *) to enable export.
          </p>
        )}
        <div className="flex gap-2">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              disabled={!canExport || exportMutation.isPending}
              onClick={() => exportMutation.mutate(format)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40"
            >
              {exportMutation.isPending && exportMutation.variables === format
                ? "Generating..."
                : `Export .${format}`}
            </button>
          ))}
        </div>
        {exportError && <p className="mt-2 text-xs text-[var(--color-danger)]">{exportError}</p>}

        {exportsQuery.data && exportsQuery.data.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {exportsQuery.data.map((exp) => (
              <li key={exp.id} className="text-xs text-[var(--color-text-muted)]">
                v{exp.version} .{exp.format} ({exp.creditSource === "free_hourly" ? "free" : "paid"}
                ) —{" "}
                <a
                  href={api.downloadUrl(id!, exp.id)}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 border-t border-[var(--color-border)] pt-6 pb-10">
        <h2 className="text-sm font-semibold mb-3">Copy for AI tool</h2>
        {!canDeliver && (
          <p className="text-xs text-[var(--color-text-muted)] mb-2">
            Generate at least one export first.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          {DELIVERY_TOOLS.map((tool) => (
            <button
              key={tool}
              disabled={!canDeliver || deliverMutation.isPending}
              onClick={() => deliverMutation.mutate(tool)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40"
            >
              Copy for {DELIVERY_LABEL[tool]}
            </button>
          ))}
        </div>
        {deliveryMessage && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{deliveryMessage}</p>
        )}
        {deliveriesQuery.data && deliveriesQuery.data.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {deliveriesQuery.data.map((d) => (
              <li key={d.id} className="text-xs text-[var(--color-text-muted)]">
                {DELIVERY_LABEL[d.targetTool]} — {d.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
