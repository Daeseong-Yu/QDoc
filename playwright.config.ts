import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "3000";
const apiPort = process.env.E2E_API_PORT ?? "4000";
const baseURL = `http://127.0.0.1:${webPort}`;
const apiBaseURL = `http://127.0.0.1:${apiPort}`;
const e2eEmail = "e2e.staff@example.com";
const e2eOtpCode = "123456";
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1";
const defaultDatabaseUrl =
  "postgresql://qdoc:replace-with-local-db-secret@localhost:55432/qdoc?schema=public";

function resolveE2eDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;

  if (process.env.QDOC_ALLOW_E2E_REMOTE_DB === "true") {
    return databaseUrl;
  }

  const { hostname } = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(hostname)) {
    throw new Error(
      "Refusing to run E2E tests against a non-local DATABASE_URL. " +
        "Set QDOC_ALLOW_E2E_REMOTE_DB=true only for an intentionally isolated test database.",
    );
  }

  return databaseUrl;
}

const databaseUrl = resolveE2eDatabaseUrl();

const sharedEnv = {
  ...process.env,
  APP_ENV: "test",
  APP_URL: baseURL,
  API_BASE_URL: apiBaseURL,
  API_HOST: "127.0.0.1",
  API_PORT: apiPort,
  EMAIL_PROVIDER: "console",
  ALLOW_FIXED_OTP: "true",
  FIXED_OTP_EMAIL: e2eEmail,
  FIXED_OTP_CODE: e2eOtpCode,
  SESSION_SECRET:
    process.env.SESSION_SECRET ??
    "qdoc-e2e-session-secret-at-least-32-characters",
  DATABASE_URL: databaseUrl,
  REDIS_URL: process.env.E2E_REDIS_URL ?? "",
  MAP_PROVIDER: process.env.MAP_PROVIDER ?? "mapbox",
  MAPBOX_PUBLIC_TOKEN:
    process.env.MAPBOX_PUBLIC_TOKEN ?? "pk.qdoc-e2e-mapbox-public-token",
  MAP_MONTHLY_MAP_LOAD_LIMIT: process.env.MAP_MONTHLY_MAP_LOAD_LIMIT ?? "1",
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never" }],
      ]
    : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @qdoc/api dev",
      url: `${apiBaseURL}/health`,
      reuseExistingServer,
      timeout: 120_000,
      env: sharedEnv,
    },
    {
      command: "pnpm --filter @qdoc/web dev",
      url: baseURL,
      reuseExistingServer,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: webPort,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
