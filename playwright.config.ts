import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/support/supabase-fixture.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: process.env.SIGCA_E2E_REUSE_SERVER === "1",
    },
    {
      command: "npm run dev -- --hostname localhost",
      url: "http://localhost:3000/login",
      reuseExistingServer: process.env.SIGCA_E2E_REUSE_SERVER === "1",
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
        SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
        AUTH_FLOW_SECRET: "test-only-password-flow-secret-at-least-32-chars",
        APP_URL: "http://localhost:3000",
      },
    },
  ],
});
