import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, describeError, type ProjectStatus } from "../lib/apiClient";
import { WalletPanel } from "../components/WalletPanel";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  ready_to_export: "Ready to export",
  exported: "Exported",
  delivered: "Delivered",
};

export function Dashboard() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createProject(name),
    onSuccess: () => {
      setError(null);
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => setError(describeError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => setError(describeError(err)),
  });

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-xl font-semibold mb-6">Projects</h1>

      <WalletPanel />

      <form
        className="flex gap-2 mb-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createMutation.mutate(newName.trim());
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name"
          className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={createMutation.isPending || !newName.trim()}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "New project"}
        </button>
      </form>
      {error && <p className="mb-6 text-xs text-[var(--color-danger)]">{error}</p>}
      {!error && <div className="mb-8" />}

      {projectsQuery.isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>}
      {projectsQuery.isError && (
        <p className="text-sm text-[var(--color-danger)]">Failed to load projects.</p>
      )}

      {projectsQuery.data && projectsQuery.data.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">No projects yet.</p>
      )}

      <ul className="flex flex-col divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {projectsQuery.data?.map((project) => (
          <li key={project.id} className="flex items-center justify-between py-2.5">
            <Link to={`/projects/${project.id}`} className="text-sm font-medium hover:underline">
              {project.name}
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-muted)]">
                {STATUS_LABEL[project.status]}
              </span>
              <button
                onClick={() => deleteMutation.mutate(project.id)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
