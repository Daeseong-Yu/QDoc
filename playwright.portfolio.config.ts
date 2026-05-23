import { defineConfig, devices } from "@playwright/test";

const configuredBaseURL = process.env.QDOC_PORTFOLIO_BASE_URL ?? process.env.QDOC_PUBLIC_URL;

if (!configuredBaseURL) {
  throw new Error("QDOC_PORTFOLIO_BASE_URL or QDOC_PUBLIC_URL is required for portfolio browser smoke.");
}

function normalizeBaseURL(value: string) {
  return value.replace(/\/+$/, "");
}

function readCoordinate(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const coordinate = Number(value);

  if (!Number.isFinite(coordinate)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return coordinate;
}

export default defineConfig({
  testDir: "./tests/portfolio",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report-portfolio" }],
      ]
    : "list",
  use: {
    baseURL: normalizeBaseURL(configuredBaseURL),
    geolocation: {
      latitude: readCoordinate("QDOC_PORTFOLIO_GEO_LATITUDE", 43.465),
      longitude: readCoordinate("QDOC_PORTFOLIO_GEO_LONGITUDE", -80.522),
    },
    permissions: ["geolocation"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "portfolio-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "portfolio-mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
