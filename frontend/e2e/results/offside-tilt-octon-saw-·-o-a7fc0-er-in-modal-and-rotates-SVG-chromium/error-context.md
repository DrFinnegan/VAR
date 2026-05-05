# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: offside-tilt.spec.js >> octon saw · offside tilt slider >> seeded offside incident exposes tilt slider in modal and rotates SVG
- Location: e2e/tests/offside-tilt.spec.js:21:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="sidebar-navigation"]') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img "OCTON Neocortex" [ref=e8]
        - generic [ref=e67]:
          - generic [ref=e68]: OCTON VAR
          - paragraph [ref=e69]: NEOCORTEX FORENSIC AI
        - generic [ref=e70]: Lightning speed analyses for match decisions
      - generic [ref=e71]:
        - generic [ref=e72]:
          - generic [ref=e73]:
            - text: Email
            - textbox "operator@octonvar.com" [ref=e74]
          - generic [ref=e75]:
            - text: Password
            - textbox "Enter password" [ref=e76]
          - button "SIGN IN" [ref=e77] [cursor=pointer]:
            - img
            - text: SIGN IN
        - generic [ref=e78]:
          - text: No account?
          - button "Create one" [ref=e79] [cursor=pointer]
    - region "Notifications alt+T"
  - link "Made with Emergent" [ref=e80] [cursor=pointer]:
    - /url: https://app.emergent.sh/?utm_source=emergent-badge
    - img [ref=e81]
    - paragraph [ref=e84]: Made with Emergent
```

# Test source

```ts
  1  | /* Shared login fixture for OCTON VAR e2e tests.
  2  |  * Reads creds from /app/memory/test_credentials.md (mirrored as env vars
  3  |  * in CI) — falls back to the seeded admin account.
  4  |  */
  5  | const ADMIN_EMAIL = process.env.OCTON_ADMIN_EMAIL || "admin@octonvar.com";
  6  | const ADMIN_PASSWORD = process.env.OCTON_ADMIN_PASSWORD || "OctonAdmin2026!";
  7  | 
  8  | async function loginAsAdmin(page) {
  9  |   await page.goto("/login");
  10 |   await page.fill('[data-testid="login-email-input"]', ADMIN_EMAIL);
  11 |   await page.fill('[data-testid="login-password-input"]', ADMIN_PASSWORD);
  12 |   await page.click('[data-testid="login-form-submit-button"]');
  13 |   // Sidebar nav appears when authenticated
> 14 |   await page.waitForSelector('[data-testid="sidebar-navigation"]', { timeout: 15_000 });
     |              ^ TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
  15 | }
  16 | 
  17 | module.exports = { loginAsAdmin, ADMIN_EMAIL, ADMIN_PASSWORD };
  18 | 
```