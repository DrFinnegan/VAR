# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quick-fire.spec.js >> offside / corner fast-path (post-redesign) >> GO LIVE button is wired on the stage toolbar
- Location: e2e/tests/quick-fire.spec.js:30:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="sidebar-navigation"]') to be visible

```

```
Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open '/app/frontend/e2e/results/.playwright-artifacts-0/traces/f636be601847fc2d2e83-7aaca9baa83d8a629f5e-recording13.trace'
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