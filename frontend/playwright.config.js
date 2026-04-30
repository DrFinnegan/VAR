/* eslint-disable */
// Playwright config — runs against the live preview deployment so we
// regress real-world traffic (auth, WebSocket, Mongo writes). The preview
// URL is read from the same env var the app uses (REACT_APP_BACKEND_URL).
const fs = require("fs");
const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

// Tiny .env reader (avoids adding `dotenv` as a dependency).
function readEnvFile(p) {
  try {
    const txt = fs.readFileSync(p, "utf-8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env present — skip */ }
}
readEnvFile(path.join(__dirname, ".env"));

const BASE_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

module.exports = defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
