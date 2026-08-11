import { test, expect } from "@playwright/test";

/**
 * A genuine smoke test, not a full wizard->export->deliver journey --
 * exports depend on the shared test account's current wallet credit
 * balance (already partly consumed by manual testing during this build),
 * and Puppeteer PDF generation takes ~5-9s, both of which make a
 * full-journey test meaningfully more fragile than what it'd prove.
 *
 * Requires E2E_TEST_EMAIL/E2E_TEST_PASSWORD in apps/web/.env, for an
 * account that already exists and already belongs to an org (this test
 * never touches sign-up or org creation -- automated sign-up hits a
 * Cloudflare bot check that must not be bypassed).
 */
const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

test("sign in, create a project, see it, delete it", async ({ page }) => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error("Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in apps/web/.env to run this test.");
  }

  await page.goto("/");

  await page.getByPlaceholder("Enter email or username").fill(TEST_EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 20_000 });

  const projectName = `E2E Smoke ${Date.now()}`;
  await page.getByPlaceholder("New project name").fill(projectName);
  await page.getByRole("button", { name: "New project" }).click();

  const projectLink = page.getByRole("link", { name: projectName });
  await expect(projectLink).toBeVisible({ timeout: 10_000 });

  const projectRow = page.locator("li", { has: projectLink });
  await projectRow.getByRole("button", { name: "Delete" }).click();

  await expect(projectLink).not.toBeVisible({ timeout: 10_000 });
});
