import { Router, type RequestHandler } from "express";
import { prisma, withTenantContext } from "@prompter/db";
import { REQUIRED_WIZARD_SECTION_IDS, WIZARD_SECTIONS } from "@prompter/shared";
import { tenantScope } from "../middleware/tenantScope.js";
import { computeCompleteness } from "../lib/completeness.js";
import { canDeliver, canGenerateExport, nextStatusAfterTemplateEdit } from "../lib/projectStatus.js";
import { consumeExportCredit, getOrCreateWallet, InsufficientCreditsError } from "../lib/wallet.js";
import { renderTemplateMarkdown } from "../lib/renderMarkdown.js";
import { renderTemplateDocx } from "../lib/renderDocx.js";
import { renderTemplatePdf } from "../lib/renderPdf.js";
import { defaultExportStorage, type ExportStorage } from "../lib/exportStorage.js";
import { tunePromptForTool } from "../lib/tunePrompt.js";
import { createDefaultAiAssistClient, type AiAssistClient } from "../lib/aiAssist.js";
import { aiAssistRateLimit } from "../middleware/aiAssistRateLimit.js";
import type { DeliveryTargetTool } from "@prompter/db";
import type { ExportFormat } from "@prompter/shared";

const TEMPLATE_VERSION = "1.0.0";
const EDITABLE_SECTION_IDS = new Set(WIZARD_SECTIONS.map((f) => f.id));
const WIZARD_SECTIONS_BY_ID = new Map(WIZARD_SECTIONS.map((f) => [f.id, f]));
const SUPPORTED_EXPORT_FORMATS: ExportFormat[] = ["md", "docx", "pdf"];
const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};
const SUPPORTED_DELIVERY_TOOLS: DeliveryTargetTool[] = [
  "claude_code",
  "codex",
  "antigravity",
  "other",
];

async function renderExport(
  format: ExportFormat,
  projectName: string,
  templateResponse: Record<string, unknown>,
): Promise<string | Buffer> {
  switch (format) {
    case "md":
      return renderTemplateMarkdown(projectName, templateResponse);
    case "docx":
      return renderTemplateDocx(projectName, templateResponse);
    case "pdf":
      return renderTemplatePdf(projectName, templateResponse);
  }
}

/**
 * Factory so tests can inject a fake tenantScope (bypassing Clerk entirely)
 * instead of the real Clerk-backed one used in production.
 */
export function createProjectsRouter(
  scopeMiddleware: RequestHandler = tenantScope,
  storage: ExportStorage = defaultExportStorage,
  aiAssistClient: AiAssistClient | null = createDefaultAiAssistClient(),
) {
  const projectsRouter = Router();

  // Static wizard schema -- no tenant context needed, registered before the
  // tenantScope gate below applies to everything else in this router.
  projectsRouter.get("/wizard-schema", (_req, res) => {
    res.json({ sections: WIZARD_SECTIONS, requiredSectionIds: REQUIRED_WIZARD_SECTION_IDS });
  });

  projectsRouter.use(scopeMiddleware);

projectsRouter.post("/projects", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "name_required" });
    return;
  }

  const tenant = req.tenant!;
  const project = await withTenantContext(prisma, tenant.orgId, async (tx) => {
    const created = await tx.project.create({
      data: {
        orgId: tenant.orgId,
        createdBy: tenant.memberId,
        name: name.trim(),
        templateVersion: TEMPLATE_VERSION,
      },
    });
    await tx.templateResponse.create({
      data: { projectId: created.id, orgId: tenant.orgId },
    });
    return created;
  });

  res.status(201).json(project);
});

projectsRouter.get("/projects", async (req, res) => {
  const tenant = req.tenant!;
  const projects = await withTenantContext(prisma, tenant.orgId, (tx) =>
    tx.project.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } }),
  );
  res.json(projects);
});

projectsRouter.get("/projects/:id", async (req, res) => {
  const tenant = req.tenant!;
  const project = await withTenantContext(prisma, tenant.orgId, (tx) =>
    tx.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { templateResponse: true },
    }),
  );
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(project);
});

projectsRouter.patch("/projects/:id", async (req, res) => {
  const { name } = req.body as { name?: string };
  const tenant = req.tenant!;

  const updated = await withTenantContext(prisma, tenant.orgId, async (tx) => {
    const existing = await tx.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!existing) return null;
    return tx.project.update({
      where: { id: req.params.id },
      data: { name: name?.trim() || existing.name },
    });
  });

  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(updated);
});

projectsRouter.delete("/projects/:id", async (req, res) => {
  const tenant = req.tenant!;
  const deleted = await withTenantContext(prisma, tenant.orgId, async (tx) => {
    const existing = await tx.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!existing) return null;
    return tx.project.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  });

  if (!deleted) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).send();
});

projectsRouter.patch("/projects/:id/template", async (req, res) => {
  const tenant = req.tenant!;
  const body = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_SECTION_IDS.has(key)) {
      updates[key] = value;
    }
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "no_recognized_section_fields" });
    return;
  }

  const result = await withTenantContext(prisma, tenant.orgId, async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!project) return null;

    const templateResponse = await tx.templateResponse.update({
      where: { projectId: project.id },
      data: updates,
    });

    const { pct, isReadyToExport } = computeCompleteness(
      templateResponse as unknown as Record<string, unknown>,
    );
    const nextStatus = nextStatusAfterTemplateEdit(project.status, isReadyToExport);

    const [finalTemplateResponse, updatedProject] = await Promise.all([
      tx.templateResponse.update({
        where: { projectId: project.id },
        data: { completenessPct: pct },
      }),
      tx.project.update({ where: { id: project.id }, data: { status: nextStatus } }),
    ]);

    return { project: updatedProject, templateResponse: finalTemplateResponse };
  });

  if (!result) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result);
  });

  projectsRouter.get("/wallet", async (req, res) => {
    const tenant = req.tenant!;
    const wallet = await withTenantContext(prisma, tenant.orgId, (tx) =>
      getOrCreateWallet(tx, tenant.orgId),
    );
    res.json(wallet);
  });

  projectsRouter.get("/projects/:id/exports", async (req, res) => {
    const tenant = req.tenant!;
    const exports = await withTenantContext(prisma, tenant.orgId, (tx) =>
      tx.export.findMany({
        where: { projectId: req.params.id },
        orderBy: { version: "desc" },
      }),
    );
    res.json(exports);
  });

  projectsRouter.get("/projects/:id/exports/:exportId/download", async (req, res) => {
    const tenant = req.tenant!;
    const exportRecord = await withTenantContext(prisma, tenant.orgId, (tx) =>
      tx.export.findFirst({ where: { id: req.params.exportId, projectId: req.params.id } }),
    );
    if (!exportRecord) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const buffer = await storage.readByUrl(exportRecord.fileUrl);
    res.setHeader("Content-Type", EXPORT_CONTENT_TYPES[exportRecord.format]);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="export-v${exportRecord.version}.${exportRecord.format}"`,
    );
    res.send(buffer);
  });

  projectsRouter.post("/projects/:id/exports", async (req, res) => {
    const tenant = req.tenant!;
    const { format } = req.body as { format?: string };
    if (!format || !SUPPORTED_EXPORT_FORMATS.includes(format as ExportFormat)) {
      res.status(400).json({ error: "unsupported_format", supported: SUPPORTED_EXPORT_FORMATS });
      return;
    }

    try {
      // Step 1: everything that must be atomic (credit consumption, version
      // numbering) happens in a short transaction. Rendering (step 2) can be
      // slow, especially PDF, and must not hold a DB transaction open.
      const claim = await withTenantContext(prisma, tenant.orgId, async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: req.params.id, deletedAt: null },
          include: { templateResponse: true },
        });
        if (!project || !project.templateResponse) return { kind: "not_found" as const };
        if (!canGenerateExport(project.status)) return { kind: "not_ready" as const };

        const { source } = await consumeExportCredit(tx, tenant.orgId);
        const previousCount = await tx.export.count({ where: { projectId: project.id } });

        return {
          kind: "ok" as const,
          project,
          templateResponse: project.templateResponse,
          source,
          version: previousCount + 1,
        };
      });

      if (claim.kind === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (claim.kind === "not_ready") {
        res.status(409).json({ error: "not_ready_to_export" });
        return;
      }

      // Step 2: render outside the transaction. If this throws, the credit
      // consumed in step 1 is not refunded -- an accepted trade-off for this
      // phase (documented), revisit if it proves to matter in practice.
      const content = await renderExport(
        format as ExportFormat,
        claim.project.name,
        claim.templateResponse as unknown as Record<string, unknown>,
      );
      const { url } = await storage.save(
        `${tenant.orgId}/${claim.project.id}/v${claim.version}.${format}`,
        content,
      );

      // Step 3: record the result and flip project status.
      const result = await withTenantContext(prisma, tenant.orgId, async (tx) => {
        const wallet = await getOrCreateWallet(tx, tenant.orgId);
        const exportRecord = await tx.export.create({
          data: {
            projectId: claim.project.id,
            orgId: tenant.orgId,
            format: format as ExportFormat,
            fileUrl: url,
            version: claim.version,
            generatedBy: tenant.memberId,
            creditSource: claim.source,
          },
        });
        await tx.walletTransaction.create({
          data: {
            orgId: tenant.orgId,
            walletId: wallet.id,
            type: claim.source === "free_hourly" ? "free_export" : "paid_export_debit",
            amount: claim.source === "free_hourly" ? 0 : -1,
            relatedExportId: exportRecord.id,
          },
        });
        const updatedProject = await tx.project.update({
          where: { id: claim.project.id },
          data: { status: "exported" },
        });
        return { export: exportRecord, project: updatedProject };
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: "insufficient_credits" });
        return;
      }
      throw err;
    }
  });

  projectsRouter.get("/projects/:id/deliveries", async (req, res) => {
    const tenant = req.tenant!;
    const deliveries = await withTenantContext(prisma, tenant.orgId, (tx) =>
      tx.deliveryRecord.findMany({
        where: { projectId: req.params.id },
        orderBy: { createdAt: "desc" },
      }),
    );
    res.json(deliveries);
  });

  projectsRouter.post("/projects/:id/deliveries", async (req, res) => {
    const tenant = req.tenant!;
    const { targetTool, method } = req.body as { targetTool?: string; method?: string };

    if (!targetTool || !SUPPORTED_DELIVERY_TOOLS.includes(targetTool as DeliveryTargetTool)) {
      res.status(400).json({ error: "unsupported_target_tool", supported: SUPPORTED_DELIVERY_TOOLS });
      return;
    }
    if (method !== "copy") {
      res.status(400).json({
        error: "unsupported_method",
        detail: "only 'copy' is available in v1 -- 'api' and 'mcp' are deferred to v1.1/v2",
      });
      return;
    }

    const result = await withTenantContext(prisma, tenant.orgId, async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { templateResponse: true },
      });
      if (!project || !project.templateResponse) return { kind: "not_found" as const };
      if (!canDeliver(project.status)) return { kind: "not_ready" as const };

      const markdown = renderTemplateMarkdown(
        project.name,
        project.templateResponse as unknown as Record<string, unknown>,
      );
      const content = tunePromptForTool(targetTool as DeliveryTargetTool, markdown);

      const delivery = await tx.deliveryRecord.create({
        data: {
          projectId: project.id,
          orgId: tenant.orgId,
          targetTool: targetTool as DeliveryTargetTool,
          method: "copy",
          status: "success",
          initiatedBy: tenant.memberId,
        },
      });
      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { status: "delivered" },
      });

      return { kind: "ok" as const, delivery, project: updatedProject, content };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (result.kind === "not_ready") {
      res.status(409).json({ error: "export_required_first" });
      return;
    }
    res.status(201).json({ delivery: result.delivery, project: result.project, content: result.content });
  });

  projectsRouter.post("/projects/:id/ai-assist", aiAssistRateLimit, async (req, res) => {
    const tenant = req.tenant!;
    const { section, inputText } = req.body as { section?: string; inputText?: string };

    const field = section ? WIZARD_SECTIONS_BY_ID.get(section) : undefined;
    if (!field) {
      res.status(400).json({ error: "unknown_section", supported: [...WIZARD_SECTIONS_BY_ID.keys()] });
      return;
    }
    if (!inputText || !inputText.trim()) {
      res.status(400).json({ error: "input_text_required" });
      return;
    }
    if (!aiAssistClient) {
      res.status(503).json({ error: "ai_assist_unavailable", detail: "ANTHROPIC_API_KEY not configured" });
      return;
    }

    const projectId = req.params.id as string;
    const project = await withTenantContext(prisma, tenant.orgId, (tx) =>
      tx.project.findFirst({ where: { id: projectId, deletedAt: null } }),
    );
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { outputText, model, tokensUsed } = await aiAssistClient.draft({
      sectionLabel: field.label,
      inputText,
    });

    await withTenantContext(prisma, tenant.orgId, (tx) =>
      tx.aIAssistRequest.create({
        data: {
          projectId: project.id,
          orgId: tenant.orgId,
          memberId: tenant.memberId,
          section: field.id,
          inputText,
          outputText,
          model,
          tokensUsed: tokensUsed ?? undefined,
        },
      }),
    );

    res.status(200).json({ section: field.id, outputText, model });
  });

  return projectsRouter;
}

export const projectsRouter = createProjectsRouter();
