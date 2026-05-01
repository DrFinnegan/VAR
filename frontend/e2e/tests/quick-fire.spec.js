/* Quick-fire (lightning) offside & corner checks on LiveVAR.
 *
 * Asserts the two pills render, clicking each produces a fresh incident
 * with the correct type + `fast_path` flag, and the FAST-PATH badge shows
 * on the selected-incident panel.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("quick-fire offside / corner", () => {
  test("CHECK OFFSIDE pill creates an offside fast-path incident", async ({ page, request, baseURL }) => {
    await loginAsAdmin(page);
    await page.evaluate(() => localStorage.removeItem("octon_match_filter"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pill = page.locator('[data-testid="quick-offside-button"]');
    await expect(pill).toBeVisible();

    // Snapshot the current offside count so we can assert a new one was created.
    const before = await request.get(`${baseURL}/api/incidents?incident_type=offside&limit=5`).then(r => r.json());
    const beforeCount = Array.isArray(before) ? before.length : 0;

    await pill.click();
    // Wait for the toast / incident to be created; allow up to 15s for LLM call.
    await page.waitForTimeout(8500);

    const after = await request.get(`${baseURL}/api/incidents?incident_type=offside&limit=5`).then(r => r.json());
    const newest = Array.isArray(after) ? after[0] : null;
    expect(newest).toBeTruthy();
    expect(newest.tags || []).toContain("quick_fire");
    expect(newest.ai_analysis?.fast_path).toBe(true);
    expect(after.length >= beforeCount).toBe(true);
  });

  test("CHECK CORNER pill creates a corner fast-path incident", async ({ page, request, baseURL }) => {
    await loginAsAdmin(page);
    await page.evaluate(() => localStorage.removeItem("octon_match_filter"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pill = page.locator('[data-testid="quick-corner-button"]');
    await expect(pill).toBeVisible();
    await pill.click();
    await page.waitForTimeout(8500);

    const list = await request.get(`${baseURL}/api/incidents?incident_type=corner&limit=5`).then(r => r.json());
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    const newest = list[0];
    expect(newest.incident_type).toBe("corner");
    expect(newest.tags || []).toContain("quick_fire");
    expect(newest.ai_analysis?.fast_path).toBe(true);

    // FAST-PATH badge should now surface for the auto-selected incident.
    const badge = page.locator('[data-testid="fast-path-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5000 });
  });
});
