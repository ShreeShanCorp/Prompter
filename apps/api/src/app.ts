import express, { type RequestHandler } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { healthRouter } from "./routes/health.js";
import { createProjectsRouter } from "./routes/projects.js";
import { tenantScope } from "./middleware/tenantScope.js";
import { devTenantScope } from "./middleware/devTenantScope.js";

export interface CreateAppOptions {
  /** Test-only: bypasses Clerk entirely with a fake tenant resolver. */
  tenantScopeMiddleware?: RequestHandler;
}

const usingDevAuthBypass = process.env.NODE_ENV !== "production" && !process.env.CLERK_SECRET_KEY;

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());
  app.use(healthRouter);

  if (!options.tenantScopeMiddleware) {
    if (usingDevAuthBypass) {
      console.warn(
        "[dev] CLERK_SECRET_KEY not set -- using devTenantScope bypass (single demo org/user, no real auth). Never used when CLERK_SECRET_KEY is configured.",
      );
    } else {
      app.use(clerkMiddleware());
    }
  }

  const scope = options.tenantScopeMiddleware ?? (usingDevAuthBypass ? devTenantScope : tenantScope);
  app.use(createProjectsRouter(scope));
  return app;
}
