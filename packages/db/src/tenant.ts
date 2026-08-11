import { Prisma, type PrismaClient } from "../generated/client/index.js";

/**
 * Models carrying org_id, per docs/architecture/erd.md. Kept as one list so
 * the auto-scoping extension and RLS migration stay easy to cross-check.
 */
const TENANT_SCOPED_MODELS = new Set([
  "OrgMembership",
  "Project",
  "TemplateResponse",
  "Export",
  "DeliveryRecord",
  "Wallet",
  "CreditPurchase",
  "WalletTransaction",
  "AIAssistRequest",
  "AdminAccessLog",
]);

const READ_FILTER_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const WRITE_SCOPE_OPS = new Set(["update", "updateMany", "delete", "deleteMany"]);

/**
 * Layer 2 of the defense-in-depth design (docs/architecture/multi-tenancy.md):
 * every query against a tenant-scoped model gets org_id injected here,
 * independent of the Postgres RLS policies applied in the enable_rls migration.
 */
export function tenantScopedClient(client: PrismaClient, orgId: string) {
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const scopedArgs = args as { where?: Record<string, unknown>; data?: unknown };

          if (READ_FILTER_OPS.has(operation) || WRITE_SCOPE_OPS.has(operation)) {
            scopedArgs.where = { ...scopedArgs.where, orgId };
          }
          if (operation === "create") {
            scopedArgs.data = { ...(scopedArgs.data as Record<string, unknown>), orgId };
          }
          if (operation === "createMany") {
            const data = scopedArgs.data;
            scopedArgs.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as Record<string, unknown>), orgId }))
              : data;
          }

          return query(scopedArgs);
        },
      },
    },
  });
}

export type TenantScopedClient = ReturnType<typeof tenantScopedClient>;

/**
 * Runs `fn` inside a transaction with app.current_org_id set for Postgres RLS
 * (Layer 1) and a tenant-scoped Prisma client for auto-injected org_id
 * filtering (Layer 2). Use this for every tenant-scoped query in the app.
 */
export async function withTenantContext<T>(
  client: PrismaClient,
  orgId: string,
  fn: (tx: TenantScopedClient) => Promise<T>,
): Promise<T> {
  // The extension must be applied to the base client *before* opening the
  // transaction -- Prisma's transaction proxy client has no $extends of its
  // own, but a transaction opened from an already-extended client keeps the
  // extension's query hooks active on `tx`.
  const scopedClient = tenantScopedClient(client, orgId);
  return scopedClient.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx as unknown as TenantScopedClient);
  });
}
