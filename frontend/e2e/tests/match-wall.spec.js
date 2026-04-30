/* Match-Wall deep-link regression.
 * Bug fixed Apr-2026: clicking a match tile used to land on `/` and show
 * the previously-cached incident. Tiles now link to `/?match=<id>` and
 * LiveVAR auto-selects the latest incident for that match.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("match-wall deep-link", () => {
  test("clicking a tile scopes LiveVAR to that match", async ({ page, request, baseURL }) => {
    // Ensure demo matches exist (idempotent on backend).
    await request.post(`${baseURL}/api/seed-demo`).catch(() => {});

    await loginAsAdmin(page);
    await page.goto("/match-wall");
    await page.waitForSelector('[data-testid="live-match-wall-page"]');

    const tiles = page.locator('[data-testid^="match-tile-"]');
    // Wait up to 10s for tiles to hydrate after the initial API fetch.
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);

    const firstTile = tiles.first();
    const testId = await firstTile.getAttribute("data-testid");
    const matchId = testId.replace("match-tile-", "");

    const href = await firstTile.getAttribute("href");
    expect(href).toContain(`/?match=${matchId}`);

    await firstTile.click();

    // URL is cleaned post-navigation
    await expect(page).toHaveURL(/\/$/, { timeout: 8_000 });

    // Filter persisted to localStorage
    const stored = await page.evaluate(() => localStorage.getItem("octon_match_filter"));
    expect(stored).toBe(matchId);
  });
});
