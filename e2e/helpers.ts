import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function signIn(browser: Browser, email: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  const res = await page.request.post("/api/auth/dev/sign-in", { data: { email, name } });
  expect(res.ok()).toBeTruthy();
  return page;
}

export async function makePdf(text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText(text, { x: 50, y: 780, size: 16, font });
  return Buffer.from(await doc.save());
}

/**
 * Accessibility + layout gate for the current screen:
 *  - axe (WCAG 2.1 A/AA): no serious or critical violations
 *  - no horizontal scrolling at the current viewport
 * PDF iframes are excluded (third-party viewer content).
 */
export async function checkScreen(page: Page, label: string) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("iframe").exclude("nextjs-portal").analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`).join("\n");
  expect(bad, `${label} accessibility violations:\n${summary}`).toEqual([]);
  // SHOTS=1 pnpm e2e → a screenshot of every checked screen per viewport, for the visual review pass.
  if (process.env.SHOTS) {
    const viewport = (page.viewportSize()?.width ?? 0) < 600 ? "phone" : "desktop";
    await page.screenshot({ path: `test-results/shots/${viewport}/${label.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: true });
  }
}
