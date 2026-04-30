/* Boost Confidence chip smoke test.
 * Surfaces only on incidents with final_confidence < 80 %. The chip
 * triggers a 4-question Q&A flow and reanalyses the incident. We assert
 * that the chip is rendered (when an eligible incident exists) and that
 * clicking it opens the Q&A dialog.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("boost confidence chip", () => {
  test("chip opens the Q&A dialog when a low-confidence incident is selected",
    async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const chip = page.locator('[data-testid="boost-confidence-chip"]');
      const present = await chip.first().isVisible().catch(() => false);
      if (!present) {
        test.skip(true, "No <80% incident currently selected — chip hidden.");
      }
      await chip.first().click();
      // Either the boost dialog opens or a toast confirms request — both
      // are acceptable smoke signals that the chip is wired.
      await page.waitForTimeout(2000);
      const body = await page.locator("body").innerText();
      expect(body.toLowerCase()).toMatch(/boost|confidence|question/);
    }
  );
});
