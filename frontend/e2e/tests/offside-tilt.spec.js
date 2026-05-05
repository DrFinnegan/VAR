/* OCTON SAW offside lines — tilt slider verification.
 *
 * The 2026-02 fix introduced a TILT slider that rotates BOTH offside
 * lines together so they stay parallel to the goal line under broadcast
 * camera perspective. This test:
 *   1. Seeds an offside incident with text-only payload (the frame_breakdown
 *      will be empty but we mount the modal with synthetic frames via the
 *      backend's b64 thumbnail API for a visible SVG).
 *   2. Creates an incident with extra_images so frames are populated.
 *   3. Opens the OCTON SAW modal.
 *   4. Verifies the tilt slider exists.
 *   5. Drags it to 12° and asserts the SVG <g> rotate transform updates.
 */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("../helpers/auth");

const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgP//Z";

test.describe("octon saw · offside tilt slider", () => {
  test("seeded offside incident exposes tilt slider in modal and rotates SVG", async ({ page, request, baseURL }) => {
    await loginAsAdmin(page);

    // Seed an offside incident WITH a tiny image so the AI returns frames.
    const resp = await request.post(`${baseURL}/api/quick/offside`, {
      data: {
        team_involved: "Liverpool",
        timestamp_in_match: "23:45",
        image_base64: TINY_JPEG_B64,
        extra_images_base64: [TINY_JPEG_B64, TINY_JPEG_B64],
      },
    });
    expect(resp.ok()).toBeTruthy();
    const inc = await resp.json();
    expect(inc.incident_type).toBe("offside");

    // Refresh the page so it picks up the new incident at the top.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Open the OCTON SAW modal by clicking the EXPLAIN button.
    const explain = page.locator('[data-testid="octon-saw-explain-button"]').first();
    await explain.waitFor({ state: "visible", timeout: 15_000 });
    await explain.click({ force: true });

    // Modal mounted
    await page.waitForSelector('[data-testid="octon-saw-modal"]', { timeout: 5_000 });

    // Tilt slider present
    const slider = page.locator('[data-testid="octon-offside-tilt-slider"]');
    await expect(slider).toBeVisible();

    // Drive the slider to 12° via the input event
    await slider.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "12");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);

    // The SVG <g> wrapping the DEFENDER line must now have transform with rotate(12...)
    const transform = await page.evaluate(() => {
      const groups = document.querySelectorAll('[data-testid="octon-saw-modal"] svg g');
      for (const g of groups) {
        const t = g.getAttribute("transform") || "";
        if (t.includes("rotate(12")) return t;
      }
      return null;
    });
    expect(transform, "expected <g> rotate(12,...) but found nothing").toContain("rotate(12");

    // Reset button shows the current angle and snaps back to 0°
    const reset = page.locator('[data-testid="octon-offside-tilt-reset"]');
    await expect(reset).toBeVisible();
    await reset.click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const groups = document.querySelectorAll('[data-testid="octon-saw-modal"] svg g');
      for (const g of groups) {
        const t = g.getAttribute("transform") || "";
        if (t.includes("rotate(0,")) return t;
      }
      return null;
    });
    expect(after, "expected reset to 0°").toContain("rotate(0");
  });
});
