/* OFFSIDE / CORNER fast-path coverage post-redesign.
 *
 * The standalone OFFSIDE pill was removed from the front page on
 * 2026-02 — offside now runs through the standard NEW INCIDENT modal
 * (incident_type=offside) but uses the same Law 11 evidence-grounded
 * fast-path under the hood. The CORNER pill stays parked until corpus
 * has 5+ in-play clips. Both backend endpoints remain live and tested
 * here.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("offside / corner fast-path (post-redesign)", () => {
  test("OFFSIDE pill is removed from the front page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const pill = page.locator('[data-testid="quick-offside-button"]');
    await expect(pill).toHaveCount(0);
  });

  test("CORNER pill is mounted on the front page (re-introduced 2026-02)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const pill = page.locator('[data-testid="quick-corner-button"]');
    await pill.waitFor({ state: "visible", timeout: 10_000 });
  });

  test("GO LIVE button is wired on the stage toolbar", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const live = page.locator('[data-testid="go-live-button"]');
    await expect(live).toBeVisible();
  });

  test("Hippocampus / Neocortex header is mounted", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="hippo-neo-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="hippocampus-region"]')).toBeVisible();
    await expect(page.locator('[data-testid="neocortex-region"]')).toBeVisible();
  });

  test("Backend POST /api/quick/offside still produces a fast-path incident", async ({ request, baseURL }) => {
    const resp = await request.post(`${baseURL}/api/quick/offside`, {
      data: { team_involved: "Liverpool", timestamp_in_match: "23:45" },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.incident_type).toBe("offside");
    expect(data.tags || []).toContain("quick_fire");
    expect(data.ai_analysis?.fast_path).toBe(true);
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

  test("Standard NEW INCIDENT with incident_type=offside runs the fast-path", async ({ request, baseURL, page }) => {
    await loginAsAdmin(page);
    const resp = await request.post(`${baseURL}/api/incidents`, {
      data: {
        incident_type: "offside",
        description: "Through-ball played to forward, defender stepped up",
        timestamp_in_match: "34:12",
        team_involved: "Liverpool",
      },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.incident_type).toBe("offside");
    expect(data.ai_analysis?.fast_path).toBe(true);
    // No visual evidence ⇒ confidence must be capped honestly
    expect(data.ai_analysis?.final_confidence).toBeLessThanOrEqual(70);
  });
});
