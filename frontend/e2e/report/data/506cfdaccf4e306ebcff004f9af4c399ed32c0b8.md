# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quick-fire.spec.js >> offside / corner fast-path (post-redesign) >> Standard NEW INCIDENT with incident_type=offside runs the fast-path
- Location: e2e/tests/quick-fire.spec.js:69:3

# Error details

```
Error: browserType.launch: Executable doesn't exist at /pw-browsers/chromium_headless_shell-1217/chrome-linux/headless_shell
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```