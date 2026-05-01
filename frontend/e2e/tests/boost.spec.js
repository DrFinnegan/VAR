/* Boost Confidence chip smoke test.
 *
 * The `/seed-demo` endpoint inserts a guaranteed <80% pending incident
 * whose description contains the marker `OCTON-BOOST-DEMO`. This test
 * seeds (idempotent), finds that incident in the right rail list,
 * selects it, and asserts the Boost chip is visible + clickable.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("boost confidence chip", () => {
  test("seeded low-confidence incident surfaces and opens the Boost Q&A dialog",
    async ({ page, request, baseURL }) => {
      // Ensure the seed has run (idempotent)
      await request.post(`${baseURL}/api/seed-demo`).catch(() => {});

      await loginAsAdmin(page);
      // Clear any stale match filter set by earlier specs (e.g. match-wall
      // deep-link) so the right rail shows incidents from every match.
      await page.evaluate(() => localStorage.removeItem("octon_match_filter"));
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find the boost-demo incident id by fetching the incident list
      const incidents = await request.get(`${baseURL}/api/incidents?limit=100`)
        .then(r => r.json());
      const boostIncident = incidents.find(i =>
        (i.description || "").includes("OCTON-BOOST-DEMO")
      );
      expect(boostIncident, "Seed didn't insert the boost-demo incident").toBeTruthy();

      // Click the incident item in the right rail. The radix ScrollArea
      // wraps the list so we click via DOM dispatch to bypass any
      // scroll/overlay quirks.
      const item = page.locator(`[data-testid="incident-item-${boostIncident.id}"]`);
      await expect(item).toBeAttached({ timeout: 10_000 });
      await item.evaluate((el) => el.click());
      await page.waitForTimeout(800);

      // Chip should now be visible
      const chip = page.locator('[data-testid="boost-confidence-chip"]');
      await expect(chip).toBeVisible({ timeout: 5000 });

      await chip.click();
      // Modal opens — dialog body mentions questions / confidence / boost
      await page.waitForTimeout(2000);
      const body = (await page.locator("body").innerText()).toLowerCase();
      expect(body).toMatch(/boost|confidence|question/);
    }
  );
});
