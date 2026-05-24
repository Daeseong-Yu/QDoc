import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const expectProviderMap = process.env.QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP === "true";
const expectedReleaseSha = process.env.QDOC_PORTFOLIO_EXPECT_RELEASE_SHA?.trim().toLowerCase();
const configuredBaseURL = process.env.QDOC_PORTFOLIO_BASE_URL ?? process.env.QDOC_PUBLIC_URL ?? "http://127.0.0.1";
const internalTokens = [
  "cost guard active",
  "otp_delivery_unavailable",
  "rate_limited",
  "invalid_otp",
  "expired_otp",
  "map_provider_disabled",
  "map_budget_exhausted",
  "queue_closed",
  '"unauthorized"',
  '"forbidden"',
  "invalid_request",
  "invalid_transition",
  "internal_error",
  "not_found",
  "provider_disabled",
  "token_missing",
  "budget_exhausted",
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

async function expectCandidateRelease(request: APIRequestContext) {
  if (!expectedReleaseSha) {
    return;
  }

  expect(expectedReleaseSha, "QDOC_PORTFOLIO_EXPECT_RELEASE_SHA must be a 40-character Git SHA").toMatch(/^[0-9a-f]{40}$/);

  const response = await request.get("/api/release");
  expect(response.ok(), "public URL should expose safe release identity at /api/release").toBe(true);

  const payload = (await response.json()) as { releaseSha?: unknown };
  expect(
    payload.releaseSha,
    "public URL is not serving the expected candidate release; redeploy before collecting portfolio smoke evidence",
  ).toBe(expectedReleaseSha);
}

async function expectNoInternalCopy(page: Page) {
  const bodyText = (await page.locator("body").innerText()).toLowerCase();

  for (const token of internalTokens) {
    expect.soft(bodyText, `public UI should not expose ${token}`).not.toContain(token);
  }
}

async function expectPatientSignInSurface(page: Page) {
  await expect(page.getByPlaceholder("you@example.com"), "patient email OTP input should be reachable without developer help").toBeVisible();
  await expect(page.getByRole("button", { name: "Send code" }), "patient OTP send control should be visible but not clicked by public smoke").toBeVisible();
}

async function selectLastClinicCard(page: Page) {
  const cards = page.getByTestId("clinic-site-card");
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  const target = cards.nth(Math.max(0, count - 1));
  const heading = target.locator("h2").first();
  const siteName = (await heading.innerText()).trim();

  await target.click();
  await expect(target).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("clinic-map-selected-label")).toContainText(siteName);
}

async function selectVisibleMapMarker(page: Page) {
  const markerButtons = page.locator('[data-testid="qdoc-map-marker"], [data-testid="provider-map-marker"]');
  const count = await markerButtons.count();

  if (count === 0) {
    return;
  }

  const target = markerButtons.nth(count - 1);
  const markerLabel = (await target.getAttribute("aria-label"))?.replace(/^Select\s+/, "").trim();

  await target.click();

  if (markerLabel) {
    await expect(page.getByTestId("clinic-map-selected-label")).toContainText(markerLabel);
  }

  await expect(target).toHaveAttribute("data-selected", "true");
}

async function expectPositiveMapCount(page: Page, attribute: string, message: string) {
  await expect(page.getByTestId("clinic-map-section"), message).toHaveAttribute(attribute, /^[1-9]\d*$/);
}

async function readNumericMapAttribute(page: Page, attribute: string) {
  const rawValue = await page.getByTestId("clinic-map-section").getAttribute(attribute);
  expect(rawValue, `${attribute} should be present`).not.toBeNull();

  const value = Number(rawValue);
  expect(Number.isFinite(value), `${attribute} should be numeric`).toBe(true);

  return value;
}

async function pollNumericMapAttribute(page: Page, attribute: string) {
  return page.getByTestId("clinic-map-section").evaluate((element, name) => Number(element.getAttribute(name)), attribute);
}

test.describe("portfolio public browser smoke", () => {
  test("loads the patient map and keeps public controls usable", async ({ page, request }) => {
    await expectCandidateRelease(request);

    const failingApiResponses = collectFailingApiResponses(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Nearby clinics" })).toBeVisible();
    await expect(page.getByText("Clinic map")).toBeVisible();
    await expectPatientSignInSurface(page);
    const mapSection = page.getByTestId("clinic-map-section");
    await expect(mapSection).toBeVisible();
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
      await expect(mapSection, "strict provider smoke requires browser geolocation").toHaveAttribute("data-has-user-location", "true");
      await expect(mapSection, "nearby provider discovery should finish before strict map assertions").toHaveAttribute(
        "data-nearby-search-settled",
        "true",
      );
      await expect(mapSection, "provider-backed map should reach ready state").toHaveAttribute("data-map-state", "ready");
      await expectPositiveMapCount(page, "data-qdoc-site-count", "strict provider smoke requires QDoc clinic markers");
      await expectPositiveMapCount(page, "data-provider-place-count", "strict provider smoke requires nearby provider discovery places");
      await expectPositiveMapCount(page, "data-map-display-place-count", "strict provider smoke requires rendered map places");
      await expect(fallback, "provider-backed map should not show the fallback map").toHaveCount(0);
      await expect(providerSurface, "provider-backed map surface should render in a public browser").toBeVisible();
      await page.getByTestId("clinic-map-provider-container").hover();
      await page.mouse.wheel(0, -300);
      await expect(page.getByTestId("clinic-map-provider-pan-right")).toBeVisible();
      await expect(page.getByTestId("clinic-map-provider-zoom-in")).toBeVisible();
      await expect(page.getByTestId("clinic-map-provider-zoom-out")).toBeVisible();
      const providerPanCount = await readNumericMapAttribute(page, "data-provider-pan-count");
      await page.getByTestId("clinic-map-provider-pan-right").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-provider-pan-count"), {
          message: "provider pan control should call the live map",
        })
        .toBeGreaterThan(providerPanCount);
      const providerZoomCount = await readNumericMapAttribute(page, "data-provider-zoom-count");
      await page.getByTestId("clinic-map-provider-zoom-in").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-provider-zoom-count"), {
          message: "provider zoom-in control should call the live map",
        })
        .toBeGreaterThan(providerZoomCount);
      const providerZoomInCount = await readNumericMapAttribute(page, "data-provider-zoom-count");
      await page.getByTestId("clinic-map-provider-zoom-out").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-provider-zoom-count"), {
          message: "provider zoom-out control should call the live map",
        })
        .toBeGreaterThan(providerZoomInCount);
      const recenterCount = await readNumericMapAttribute(page, "data-provider-recenter-count");
      await page.getByTestId("clinic-map-provider-recenter").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-provider-recenter-count"), {
          message: "provider recenter control should call the live map",
        })
        .toBeGreaterThan(recenterCount);
    } else if ((await fallback.count()) > 0) {
      await expect(fallback).toContainText("Showing clinic locations.");
      await expect(page.getByTestId("clinic-map-pan-right")).toBeVisible();
      await expect(page.getByTestId("clinic-map-zoom-in")).toBeVisible();
      await expect(page.getByTestId("clinic-map-zoom-out")).toBeVisible();
      const fallbackPanCount = await readNumericMapAttribute(page, "data-fallback-pan-count");
      await page.getByTestId("clinic-map-pan-right").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-fallback-pan-count"), {
          message: "fallback pan control should update the map viewport",
        })
        .toBeGreaterThan(fallbackPanCount);
      const fallbackZoom = await readNumericMapAttribute(page, "data-fallback-zoom");
      await page.getByTestId("clinic-map-zoom-in").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-fallback-zoom"), {
          message: "fallback zoom-in should change the map viewport",
        })
        .toBeGreaterThan(fallbackZoom);
      await page.getByTestId("clinic-map-zoom-out").click();
      await expect
        .poll(() => pollNumericMapAttribute(page, "data-fallback-zoom"), {
          message: "fallback zoom-out should restore the map viewport",
        })
        .toBe(fallbackZoom);

      const fallbackRecenter = page.getByTestId("clinic-map-fallback-recenter");
      if ((await fallbackRecenter.count()) > 0) {
        const fallbackRecenterCount = await readNumericMapAttribute(page, "data-fallback-recenter-count");
        await page.getByTestId("clinic-map-fallback-recenter").click();
        await expect
          .poll(() => pollNumericMapAttribute(page, "data-fallback-recenter-count"), {
            message: "fallback recenter should update the map viewport",
          })
          .toBeGreaterThan(fallbackRecenterCount);
      }
    }

    await selectVisibleMapMarker(page);

    expect.soft(failingApiResponses, "same-origin API calls should not return 5xx responses").toEqual([]);
  });

  test("loads the staff sign-in surface without exposing internal errors", async ({ page, request }) => {
    await expectCandidateRelease(request);

    const failingApiResponses = collectFailingApiResponses(page);

    await page.goto("/staff", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Staff queue board" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff session" })).toBeVisible();
    await expect(page.getByText("Sign in with email OTP.")).toBeVisible();
    await expect(page.getByText("Use the staff or admin email added to a site roster.")).toBeVisible();
    await expect(page.getByTestId("staff-auth-controls")).toHaveAttribute("data-auth-step", "email");
    await expect(page.getByPlaceholder("Staff email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeDisabled();
    await expectNoInternalCopy(page);

    expect.soft(failingApiResponses, "same-origin API calls should not return 5xx responses").toEqual([]);
  });
});
