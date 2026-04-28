import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PAPERCLIP_E2E_PORT ?? 3110);

// Allow pointing tests at an already-running server (e.g. Cloudflare tunnel,
// Docker container, or staging URL) by setting PAPERCLIP_E2E_BASE_URL.
// Falls back to a local server on PAPERCLIP_E2E_PORT (default 3100).
const BASE_URL =
  process.env.PAPERCLIP_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const useExternalServer = Boolean(process.env.PAPERCLIP_E2E_BASE_URL);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // webServer is skipped when PAPERCLIP_E2E_BASE_URL is set (external server).
  // Otherwise it starts `paperclipai run` automatically before the test run.
  // Requires `pnpm` to be available; install with: npm i -g pnpm
  ...(useExternalServer
    ? {}
    : {
        webServer: {
          command: `cross-env PORT=${PORT} PAPERCLIP_LISTEN_PORT=${PORT} PAPERCLIP_PORT_AUTO_SCALING_DISABLED=true PAPERCLIP_DB_BACKUP_ENABLED=false HEARTBEAT_SCHEDULER_ENABLED=false PAPERCLIP_UI_DEV_MIDDLEWARE=true pnpm --filter @paperclipai/server dev`,
          url: `${BASE_URL}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      }),
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
});
