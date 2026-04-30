/* Shared login fixture for OCTON VAR e2e tests.
 * Reads creds from /app/memory/test_credentials.md (mirrored as env vars
 * in CI) — falls back to the seeded admin account.
 */
const ADMIN_EMAIL = process.env.OCTON_ADMIN_EMAIL || "admin@octonvar.com";
const ADMIN_PASSWORD = process.env.OCTON_ADMIN_PASSWORD || "OctonAdmin2026!";

async function loginAsAdmin(page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email-input"]', ADMIN_EMAIL);
  await page.fill('[data-testid="login-password-input"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-form-submit-button"]');
  // Sidebar nav appears when authenticated
  await page.waitForSelector('[data-testid="sidebar-navigation"]', { timeout: 15_000 });
}

module.exports = { loginAsAdmin, ADMIN_EMAIL, ADMIN_PASSWORD };
