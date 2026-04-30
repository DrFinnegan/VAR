/* Auth flow: login redirects to LiveVAR + bad creds error. */
const { test, expect } = require("@playwright/test");
const { loginAsAdmin, ADMIN_EMAIL } = require("../helpers/auth");

test.describe("auth", () => {
  test("admin login lands on Live VAR dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="sidebar-navigation"]')).toBeVisible();
    // Sidebar shows the logged-in user's email/role
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });

  test("invalid password surfaces an error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[data-testid="login-email-input"]', ADMIN_EMAIL);
    await page.fill('[data-testid="login-password-input"]', "wrong-password-xyz");
    await page.click('[data-testid="login-form-submit-button"]');
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
  });
});
