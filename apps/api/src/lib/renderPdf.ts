import puppeteer from "puppeteer";
import { renderTemplateHtml } from "./renderHtml.js";

/**
 * Synchronous for now, per Stage C Phase 3 (see requirements-lock.md) --
 * launches and closes a fresh headless browser per request. Revisit with a
 * BullMQ background job + status polling if this proves too slow in
 * practice; the queue dependency is already in the stack for that.
 */
export async function renderTemplatePdf(
  projectName: string,
  templateResponse: Record<string, unknown>,
): Promise<Buffer> {
  const html = renderTemplateHtml(projectName, templateResponse);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "a4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
