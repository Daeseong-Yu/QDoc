import { expect, type Page, test } from "@playwright/test";

const expectProviderMap = process.env.QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP === "true";
const configuredBaseURL = process.env.QDOC_PORTFOLIO_BASE_URL ?? process.env.QDOC_PUBLIC_URL ?? "http://127.0.0.1";
const internalTokens = [
  "cost guard active",
  "otp_delivery_unavailable",
  "rate_limited",
  "invalid_otp",
  "expired_otp",
  "map_budget_exhausted",
  "provider_unavailable",
  "map_script_load_failed",
  "request_failed",
];

function sameOriginApiResponse(url: string) {
  const base = new URL(configuredBaseURL);
  const responseUrl = new URL(url);

  return responseUrl.origin === base.origin && responseUrl.pathname.startsWith("/api/");
}

function collectFailingApiResponses(page: Page) {
  const failingApiResponses: string[] = [];

  page.on("response", (response) => {
    if (sameOriginApiResponse(response.url()) && response.status() >= 500) {
      failingApiResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  return failingApiResponses;
}

async function expectNoInternalCopy(page: Page) {
  const bodyText = (await page.locator("body").innerText()).toLowerCase();

  for (const token of internalTokens) {
    expect.soft(bodyText, `public UI should not expose ${token}`).not.toContain(token);
  }
}

async function selectLastClinicCard(page: Page) {
  const cards = page.getByTestId("clinic-site-card");
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  const target = cards.nth(Math.max(0, count - 1));
  const heading = target.locator("h2").first();
  const siteName = (await heading.innerText()).trim();

  await target.click();
  await expect(page.getByTestId("clinic-map-selected-label")).toContainText(siteName);
}

test.describe("portfolio public browser smoke", () => {
  test("loads the patient map and keeps public controls usable", async ({ page }) => {
    const failingApiResponses = collectFailingApiResponses(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Nearby clinics" })).toBeVisible();
    await expect(page.getByText("Clinic map")).toBeVisible();
    await expect(page.getByTestId("clinic-map-section")).toBeVisible();
    await expect(page.getByTestId("patient-refresh-button")).toBeVisible();
    await expectNoInternalCopy(page);

    await page.getByTestId("patient-refresh-button").click();
    await expect(page.getByRole("heading", { name: "Nearby clinics" })).toBeVisible();
    await expectNoInternalCopy(page);

    await selectLastClinicCard(page);
    await expectNoInternalCopy(page);

    const fallback = page.getByTestId("clinic-map-fallback");
    const providerSurface = page.locator(".mapboxgl-map, .mapboxgl-canvas, .gm-style").first();

    if (expectProviderMap) {
      await expect(fallback, "provider-backed map should not show the fallback map").toHaveCount(0);
      await expect(providerSurface, "provider-backed map surface should render in a public browser").toBeVisible();
      await page.getByTestId("clinic-map-provider-container").hover();
      await page.mouse.wheel(0, -300);
      await expect(page.getByRole("button", { name: "Recenter map to your location" })).toBeVisible();
    } else if ((await fallback.count()) > 0) {
      await expect(fallback).toContainText("Showing clinic locations.");
      await expect(page.getByTestId("clinic-map-zoom-in")).toBeVisible();
      await expect(page.getByTestId("clinic-map-zoom-out")).toBeVisible();
    }

    const markerButtons = page.locator('[data-testid="qdoc-map-marker"], [data-testid="provider-map-marker"]');
    if ((await markerButtons.count()) > 0) {
      await markerButtons.first().click();
      await expect(page.getByTestId("clinic-map-selected-label")).not.toHaveText("");
    }

    expect.soft(failingApiResponses, "same-origin API calls should not return 5xx responses").toEqual([]);
  });

  test("loads the staff sign-in surface without exposing internal errors", async ({ page }) => {
    const failingApiResponses = collectFailingApiResponses(page);

    await page.goto("/staff", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Staff queue board" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff session" })).toBeVisible();
    await expect(page.getByText("Sign in with email OTP.")).toBeVisible();
    await expect(page.getByPlaceholder("Staff email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeDisabled();
    await expectNoInternalCopy(page);

    expect.soft(failingApiResponses, "same-origin API calls should not return 5xx responses").toEqual([]);
  });
});
