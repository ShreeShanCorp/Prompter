import { Router, type RequestHandler } from "express";
import { getSystemPrisma } from "@prompter/db";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin.js";

const PRODUCT_NAME_KEY = "product_name";

export function createAdminRouter(guard: RequestHandler = requirePlatformAdmin) {
  const router = Router();
  router.use(guard);

  router.get("/admin/whoami", (_req, res) => {
    // Reaching this handler already proves the guard passed.
    res.json({ isPlatformAdmin: true });
  });

  router.get("/admin/orgs", async (_req, res) => {
    const systemPrisma = getSystemPrisma();
    if (!systemPrisma) {
      res.status(503).json({ error: "system_db_not_configured" });
      return;
    }

    const orgs = await systemPrisma.org.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { memberships: true, projects: true } },
        wallet: true,
      },
    });

    res.json(
      orgs.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        createdAt: org.createdAt,
        memberCount: org._count.memberships,
        projectCount: org._count.projects,
        walletBalance: org.wallet?.balance ?? 0,
      })),
    );
  });

  router.post("/admin/orgs/:id/suspend", async (req, res) => {
    const systemPrisma = getSystemPrisma();
    if (!systemPrisma) {
      res.status(503).json({ error: "system_db_not_configured" });
      return;
    }
    const org = await systemPrisma.org.update({
      where: { id: req.params.id },
      data: { status: "suspended" },
    });
    res.json(org);
  });

  router.post("/admin/orgs/:id/reactivate", async (req, res) => {
    const systemPrisma = getSystemPrisma();
    if (!systemPrisma) {
      res.status(503).json({ error: "system_db_not_configured" });
      return;
    }
    const org = await systemPrisma.org.update({
      where: { id: req.params.id },
      data: { status: "active" },
    });
    res.json(org);
  });

  router.get("/admin/platform-settings/product-name", async (_req, res) => {
    const systemPrisma = getSystemPrisma();
    if (!systemPrisma) {
      res.status(503).json({ error: "system_db_not_configured" });
      return;
    }
    const setting = await systemPrisma.platformSetting.findUnique({
      where: { key: PRODUCT_NAME_KEY },
    });
    res.json({ value: setting?.value ?? "Prompter" });
  });

  router.put("/admin/platform-settings/product-name", async (req, res) => {
    const { value } = req.body as { value?: string };
    if (!value || !value.trim()) {
      res.status(400).json({ error: "value_required" });
      return;
    }
    const systemPrisma = getSystemPrisma();
    if (!systemPrisma) {
      res.status(503).json({ error: "system_db_not_configured" });
      return;
    }
    const setting = await systemPrisma.platformSetting.upsert({
      where: { key: PRODUCT_NAME_KEY },
      update: { value: value.trim() },
      create: { key: PRODUCT_NAME_KEY, value: value.trim() },
    });
    res.json({ value: setting.value });
  });

  return router;
}
