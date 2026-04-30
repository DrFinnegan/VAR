/* Match-Wall booth-presence pip.
 *
 * Opens a background WebSocket in a second browser context (mimicking a
 * parallel VAR booth), then navigates the main page to the Match Wall
 * and asserts the presence pip renders for that tile.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

test.describe("match-wall booth presence", () => {
  test("ghost booth connection surfaces a BOOTHS pip on the tile",
    async ({ page, browser, request, baseURL }) => {
      await request.post(`${baseURL}/api/seed-demo`).catch(() => {});

      const live = await request.get(`${baseURL}/api/matches/live`).then(r => r.json());
      const matchId = live.matches?.[0]?.match?.id;
      test.skip(!matchId, "No match seeded");

      // Spin up an isolated context + page to hold the ghost WebSocket.
      // The WS lives on that page's origin so it stays open while the
      // main test page navigates around.
      const ghostCtx = await browser.newContext();
      const ghostPage = await ghostCtx.newPage();
      await ghostPage.goto(`${baseURL}/login`);
      const wsBase = baseURL.replace("https://", "wss://").replace("http://", "ws://");
      await ghostPage.evaluate(([url]) => {
        window.__ghostWs = new WebSocket(url);
        return new Promise((res) => {
          window.__ghostWs.onopen = () => res(true);
          setTimeout(() => res(false), 3000);
        });
      }, [`${wsBase}/api/ws?match_id=${matchId}&booth_id=booth-ghost-e2e`]);

      // Give the server a moment to register + broadcast presence.
      await page.waitForTimeout(1200);

      // Main test flow
      await loginAsAdmin(page);
      await page.goto("/match-wall");
      await page.waitForSelector('[data-testid="live-match-wall-page"]');

      const pip = page.locator(`[data-testid="booth-presence-${matchId}"]`);
      await expect(pip).toBeVisible({ timeout: 10_000 });
      await expect(pip).toContainText(/BOOTH/i);

      await ghostCtx.close();
    }
  );
});
