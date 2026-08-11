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

export type CreditPack = "starter_1usd_2credits" | "value_5usd_20credits";

export interface CreditPurchase {
  id: string;
  pack: CreditPack;
  creditsGranted: number;
  amountInr: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
}

export interface CreatedOrder {
  creditPurchaseId: string;
  orderId: string;
  amountInr: number;
  currency: "INR";
  keyId?: string;
}

export interface AdminOrgSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  createdAt: string;
  memberCount: number;
  projectCount: number;
  walletBalance: number;
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error?: string; detail?: string },
  ) {
    super(body.error ?? `Request failed: ${status}`);
  }
}

/** Turns a caught mutation error into a message worth showing the user. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 423 || err.body.error === "org_suspended") {
      return "This organization has been suspended and is read-only. Contact an admin.";
    }
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status === 401) return "You need to sign in again.";
    return err.body.detail ?? err.message;
  }
  return "Something went wrong.";
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
  listCreditPurchases: () => request<CreditPurchase[]>("/billing/credit-purchases"),
  createCreditPurchase: (pack: CreditPack) =>
    request<CreatedOrder>("/billing/credit-purchases", {
      method: "POST",
      body: JSON.stringify({ pack }),
    }),

  aiAssist: (id: string, section: string, inputText: string) =>
    request<{ section: string; outputText: string; model: string }>(`/projects/${id}/ai-assist`, {
      method: "POST",
      body: JSON.stringify({ section, inputText }),
    }),

  isPlatformAdmin: () =>
    request<{ isPlatformAdmin: true }>("/admin/whoami")
      .then(() => true)
      .catch(() => false),
  listAdminOrgs: () => request<AdminOrgSummary[]>("/admin/orgs"),
  suspendOrg: (id: string) => request<{ status: string }>(`/admin/orgs/${id}/suspend`, { method: "POST" }),
  reactivateOrg: (id: string) =>
    request<{ status: string }>(`/admin/orgs/${id}/reactivate`, { method: "POST" }),
  getProductName: () => request<{ value: string }>("/admin/platform-settings/product-name"),
  setProductName: (value: string) =>
    request<{ value: string }>("/admin/platform-settings/product-name", {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
};
