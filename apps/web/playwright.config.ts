import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: new URL("./.env", import.meta.url) });

/**
 * Runs against real Clerk + a real local Postgres, not a mock -- so this
 * needs actual API/CLERK env vars in apps/api/.env and apps/web/.env (see
 * docs/runbook.md), and docker compose up -d for Postgres/Redis. It is
 * NOT run in CI (no Clerk keys there) -- local-only for now.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev --workspace @prompter/api",
      url: "http://localhost:3001/health",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 30_000,
    },
    {
      command: "npm run dev --workspace @prompter/web -- --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 30_000,
    },
  ],
});
