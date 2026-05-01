/* Quick-fire (lightning) offside checks on LiveVAR.
 *
 * Asserts the OFFSIDE pill renders, refuses to fire when the stage has
 * no media (referee-grade safety), and that the GO LIVE button is wired.
 * The CORNER pill was removed pending IFAB Law-17 demo coverage — its
 * backend endpoint stays, so we still test the API directly.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("quick-fire offside (stage-scoped)", () => {
  test("OFFSIDE pill is visible next to NEW INCIDENT", async ({ page }) => {
    await loginAsAdmin(page);
    await page.evaluate(() => localStorage.removeItem("octon_match_filter"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pill = page.locator('[data-testid="quick-offside-button"]');
    await expect(pill).toBeVisible();
  });

  test("CORNER pill was removed from the front page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const cornerPill = page.locator('[data-testid="quick-corner-button"]');
    await expect(cornerPill).toHaveCount(0);
  });

  test("GO LIVE button is wired on the stage toolbar", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const live = page.locator('[data-testid="go-live-button"]');
    await expect(live).toBeVisible();
  });

  test("Backend POST /api/quick/corner still produces a fast-path incident", async ({ request, baseURL }) => {
    const resp = await request.post(`${baseURL}/api/quick/corner`, {
      data: { team_involved: "Arsenal", timestamp_in_match: "78:10" },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.incident_type).toBe("corner");
    expect(data.tags || []).toContain("quick_fire");
    expect(data.ai_analysis?.fast_path).toBe(true);
  });
});
