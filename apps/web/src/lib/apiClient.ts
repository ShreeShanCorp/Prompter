import { getAuthToken } from "./authToken";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export type ProjectStatus = "draft" | "in_progress" | "ready_to_export" | "exported" | "delivered";
export type ExportFormat = "md" | "docx" | "pdf";
export type DeliveryTargetTool = "claude_code" | "codex" | "antigravity" | "other";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateResponse {
  completenessPct: number;
  [sectionId: string]: unknown;
}

export interface ProjectWithTemplate extends Project {
  templateResponse: TemplateResponse;
}

export interface WizardFieldDefinition {
  id: string;
  section: number;
  label: string;
  type: "text" | "textarea" | "table" | "list";
  required: boolean;
}

export interface ExportRecord {
  id: string;
  format: ExportFormat;
  version: number;
  creditSource: "free_hourly" | "purchased";
  createdAt: string;
}

export interface DeliveryRecord {
  id: string;
  targetTool: DeliveryTargetTool;
  method: "copy";
  status: "success" | "pending" | "failed";
  createdAt: string;
}

export interface Wallet {
  balance: number;
  lastFreeExportAt: string | null;
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error?: string; detail?: string },
  ) {
    super(body.error ?? `Request failed: ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { ApiError };

export const api = {
  listProjects: () => request<Project[]>("/projects"),
  createProject: (name: string) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  getProject: (id: string) => request<ProjectWithTemplate>(`/projects/${id}`),
  getWizardSchema: () =>
    request<{ sections: WizardFieldDefinition[]; requiredSectionIds: string[] }>("/wizard-schema"),
  saveTemplate: (id: string, updates: Record<string, unknown>) =>
    request<{ project: Project; templateResponse: TemplateResponse }>(`/projects/${id}/template`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  listExports: (id: string) => request<ExportRecord[]>(`/projects/${id}/exports`),
  generateExport: (id: string, format: ExportFormat) =>
    request<{ export: ExportRecord; project: Project }>(`/projects/${id}/exports`, {
      method: "POST",
      body: JSON.stringify({ format }),
    }),
  downloadUrl: (id: string, exportId: string) =>
    `${BASE_URL}/projects/${id}/exports/${exportId}/download`,

  listDeliveries: (id: string) => request<DeliveryRecord[]>(`/projects/${id}/deliveries`),
  deliver: (id: string, targetTool: DeliveryTargetTool) =>
    request<{ delivery: DeliveryRecord; project: Project; content: string }>(
      `/projects/${id}/deliveries`,
      { method: "POST", body: JSON.stringify({ targetTool, method: "copy" }) },
    ),

  getWallet: () => request<Wallet>("/wallet"),

  aiAssist: (id: string, section: string, inputText: string) =>
    request<{ section: string; outputText: string; model: string }>(`/projects/${id}/ai-assist`, {
      method: "POST",
      body: JSON.stringify({ section, inputText }),
    }),
};
