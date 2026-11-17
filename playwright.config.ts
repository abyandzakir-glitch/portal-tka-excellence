import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: ".env.local", quiet: true });

/**
 * E2E tests for critical flows (CLAUDE.md §4). They run against the Supabase
 * project in .env.local with the dummy seed and demo accounts
 * (SEED_DEMO_PASSWORD). Every test leaves the data as it found it.
 */
export default defineConfig({
  testDir: "e2e",
  // Generous: `next dev` compiles each route on first visit.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : // Own port so it never collides with a dev server you already have running on 3000.
      { command: "pnpm dev --port 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 180_000 },
});
