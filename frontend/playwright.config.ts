import { defineConfig, devices } from "@playwright/test";

// Hoban SafeMate E2E config.
// Default target: deployed Railway environment (E2E smoke against prod).
// Override with PLAYWRIGHT_BASE_URL=http://localhost:8000 for local backend.
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  "https://hoban-safemate-production.up.railway.app";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // mic permission needed for realtime voice tests
    permissions: ["microphone"],
  },
  projects: [
    {
      name: "smoke",
      testMatch: /.*\.smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Chromium-based mobile profile avoids needing a separate WebKit install.
      name: "e2e-mobile",
      testMatch: /.*\.e2e\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        // explicit Chromium ensures we don't try to launch WebKit on Windows
        browserName: "chromium",
      },
    },
  ],
});
