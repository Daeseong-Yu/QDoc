import { createHash, createHmac } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

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

process.env.DATABASE_URL = resolveE2eDatabaseUrl();

const prisma = new PrismaClient();

const e2eOrgId = "org-e2e-playwright";
const e2eSiteId = "site-e2e-playwright";
const e2eQueueId = "queue-e2e-playwright";
const e2eSiteName = "E2E Clinic";
const e2eQueueName = "E2E Walk-in";
let e2eEmail = "e2e.staff@example.com";
const e2eOtpCode = "123456";

function getE2eEmail(testInfo: TestInfo) {
  const slug = `${testInfo.project.name}-${testInfo.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return `e2e.${slug}@example.com`;
}

function getE2eMemberEmail(email = e2eEmail) {
  const token = createHash("sha256").update(email).digest("hex").slice(0, 12);

  return `e2e.member.${token}@example.com`;
}

function getE2eRequesterIp(testInfo: TestInfo, offset = 0) {
  const source = `${testInfo.project.name}-${testInfo.title}-${offset}`;
  const hash = [...source].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 200, 0);

  return `198.51.100.${20 + hash}`;
}

function hashOtpForTest(email: string, code: string) {
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required for E2E OTP verification");
  }

  return createHmac("sha256", sessionSecret).update(`otp:${email}:${code}`).digest("base64url");
}

function getMapSearchQueryKey(provider: "mapbox", latitude: number, longitude: number, radiusMeters: number) {
  const roundedLatitude = Math.round(latitude * 100) / 100;
  const roundedLongitude = Math.round(longitude * 100) / 100;
  const roundedRadiusMeters = Math.max(500, Math.min(10_000, Math.round(radiusMeters / 500) * 500));

  return createHash("sha256")
    .update(`${provider}:${roundedLatitude.toFixed(2)}:${roundedLongitude.toFixed(2)}:${roundedRadiusMeters}`)
    .digest("hex");
}

async function installMapboxStub(page: Page) {
  await page.route("https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css", async (route) => {
    await route.fulfill({
      contentType: "text/css",
      body: ".mapboxgl-map{position:absolute;inset:0}",
    });
  });
  await page.route("https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        window.__qdocMapboxEvents = [];
        window.mapboxgl = {
          accessToken: "",
          Map: class {
            constructor(options) {
              this._container = options.container;
              window.__qdocMapboxEvents.push({ type: "map", center: options.center, zoom: options.zoom });
              const surface = document.createElement("div");
              surface.dataset.testid = "mapbox-surface";
              surface.style.position = "absolute";
              surface.style.inset = "0";
              surface.style.pointerEvents = "none";
              this._container.appendChild(surface);
            }
            addControl() {}
            flyTo(options) {
              window.__qdocMapboxEvents.push({ type: "flyTo", center: options.center, zoom: options.zoom });
            }
            remove() {
              this._container.replaceChildren();
            }
          },
          Marker: class {
            constructor(options = {}) {
              this._element = options.element || document.createElement("div");
              this._element.dataset.testid = this._element.dataset.testid || "mapbox-marker";
            }
            setLngLat(coordinates) {
              this._coordinates = coordinates;
              this._element.dataset.lngLat = coordinates.join(",");
              return this;
            }
            setPopup() {
              return this;
            }
            addTo(map) {
              map._container.appendChild(this._element);
              return this;
            }
          },
          NavigationControl: class {},
          Popup: class {
            setText() {
              return this;
            }
          },
        };
      `,
    });
  });
}

async function resetE2eData() {
  const user = await prisma.user.findUnique({
    where: { email: e2eEmail },
    select: { id: true },
  });
  const ticketIds = (
    await prisma.ticket.findMany({
      where: {
        OR: [{ siteId: e2eSiteId }, ...(user ? [{ userId: user.id }] : [])],
      },
      select: { id: true },
    })
  ).map((ticket) => ticket.id);

  if (ticketIds.length > 0) {
    await prisma.notificationLog.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await prisma.ticketEvent.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await prisma.ticket.deleteMany({
      where: { id: { in: ticketIds } },
    });
  }

  if (user) {
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
  }

  await prisma.mapUsagePeriod.deleteMany({ where: { provider: "mapbox" } });
  await prisma.mapSearchCache.deleteMany({ where: { provider: "mapbox" } });
  await prisma.mapProviderConfigAudit.deleteMany({
    where: { provider: "mapbox" },
  });
  await prisma.otpChallenge.deleteMany({
    where: { email: { in: [e2eEmail, getE2eMemberEmail()] } },
  });
  await prisma.membership.deleteMany({ where: { siteId: e2eSiteId } });
  await prisma.queue.deleteMany({ where: { siteId: e2eSiteId } });
  await prisma.site.deleteMany({ where: { id: e2eSiteId } });

  const e2eUser = await prisma.user.upsert({
    where: { email: e2eEmail },
    update: {},
    create: { email: e2eEmail },
  });

  await prisma.organization.upsert({
    where: { id: e2eOrgId },
    update: { name: "QDoc E2E" },
    create: { id: e2eOrgId, name: "QDoc E2E" },
  });
  await prisma.site.create({
    data: {
      id: e2eSiteId,
      organizationId: e2eOrgId,
      name: e2eSiteName,
      distanceKm: 0,
      addressLine1: "1 E2E Way",
      city: "Waterloo",
      region: "ON",
      postalCode: "N2L 3G1",
      country: "CA",
      latitude: 43.4643,
      longitude: -80.5204,
      locationSource: "e2e",
      locationVerifiedAt: new Date("2026-05-20T00:00:00.000Z"),
    },
  });
  await prisma.queue.create({
    data: {
      id: e2eQueueId,
      siteId: e2eSiteId,
      name: e2eQueueName,
      isOpen: true,
    },
  });
  await prisma.membership.create({
    data: {
      siteId: e2eSiteId,
      userId: e2eUser.id,
      role: "admin",
    },
  });
  await prisma.mapProviderConfig.upsert({
    where: { provider: "mapbox" },
    update: {
      isEnabled: true,
      monthlyMapLoadLimit: 1,
      hardStopEnabled: true,
    },
    create: {
      provider: "mapbox",
      isEnabled: true,
      monthlyMapLoadLimit: 1,
      hardStopEnabled: true,
    },
  });
}

async function resetMapGuardrailsAfterE2e() {
  await prisma.mapUsagePeriod.deleteMany({ where: { provider: "mapbox" } });
  await prisma.mapSearchCache.deleteMany({ where: { provider: "mapbox" } });
  await prisma.mapProviderConfigAudit.deleteMany({
    where: { provider: "mapbox" },
  });
  await prisma.mapProviderConfig.upsert({
    where: { provider: "mapbox" },
    update: {
      isEnabled: false,
      monthlyMapLoadLimit: 0,
      hardStopEnabled: true,
    },
    create: {
      provider: "mapbox",
      isEnabled: false,
      monthlyMapLoadLimit: 0,
      hardStopEnabled: true,
    },
  });
}

function staffColumn(page: Page, name: string) {
  return page.locator("section").filter({
    has: page.locator("h3", { hasText: new RegExp(`^${name}$`) }),
  }).last();
}

function patientTicket(page: Page) {
  return page.locator("article").filter({ hasText: e2eSiteName }).first();
}

async function signIn(page: Page, emailPlaceholder: string, email = e2eEmail) {
  const emailInput = page.getByPlaceholder(emailPlaceholder);

  await emailInput.fill(email);
  await expect(emailInput).toHaveValue(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(
    page.getByText("Enter the verification code sent to your email."),
  ).toBeVisible();
  await prisma.otpChallenge.updateMany({
    where: {
      email,
      verifiedAt: null,
    },
    data: {
      codeHash: hashOtpForTest(email, e2eOtpCode),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await page.getByPlaceholder("6-digit code").fill(e2eOtpCode);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}

async function selectE2eSite(page: Page) {
  await page.getByRole("button", { name: new RegExp(`^${e2eSiteName}`) }).click();
}

async function expectPatientStatus(page: Page, status: string) {
  await page.goto("/");
  await expect(patientTicket(page)).toContainText(e2eQueueName);
  await expect(patientTicket(page)).toContainText(status);
}

async function expectLatestE2eTicketStatus(status: string) {
  await expect
    .poll(async () => {
      const ticket = await prisma.ticket.findFirst({
        where: {
          queueId: e2eQueueId,
          siteId: e2eSiteId,
          user: { email: e2eEmail },
        },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });

      return ticket?.status ?? null;
    })
    .toBe(status);
}

test.beforeEach(async ({ page }, testInfo) => {
  e2eEmail = getE2eEmail(testInfo);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo),
  });
  await resetE2eData();
});

test.afterAll(async () => {
  await resetMapGuardrailsAfterE2e();
  await prisma.$disconnect();
});

test("enforces the monthly map load guard before exposing provider usage", async ({
  request,
}) => {
  const initialConfig = await request.get("/api/maps/config");
  await expect(initialConfig).toBeOK();
  await expect(initialConfig.json()).resolves.toMatchObject({
    provider: "mapbox",
    canLoad: true,
    publicToken: null,
    remainingMapLoads: 1,
    reason: "available",
  });

  const acceptedUsage = await request.post("/api/maps/usage", {
    data: { usageType: "map_load" },
  });
  await expect(acceptedUsage).toBeOK();
  await expect(acceptedUsage.json()).resolves.toMatchObject({
    provider: "mapbox",
    usageType: "map_load",
    accepted: true,
    publicToken: "pk.qdoc-e2e-mapbox-public-token",
    remainingMapLoads: 0,
  });

  const rejectedUsage = await request.post("/api/maps/usage", {
    data: { usageType: "map_load" },
  });
  expect(rejectedUsage.status()).toBe(409);
  await expect(rejectedUsage.json()).resolves.toMatchObject({
    error: "map_budget_exhausted",
  });

  const exhaustedConfig = await request.get("/api/maps/config");
  await expect(exhaustedConfig).toBeOK();
  await expect(exhaustedConfig.json()).resolves.toMatchObject({
    provider: "mapbox",
    canLoad: false,
    publicToken: null,
    remainingMapLoads: 0,
    reason: "budget_exhausted",
  });
});

test("loads the patient map around the browser location without provider SDK when guarded off", async ({
  page,
  context,
}) => {
  await prisma.mapProviderConfig.update({
    where: { provider: "mapbox" },
    data: {
      isEnabled: true,
      monthlyMapLoadLimit: 1,
      hardStopEnabled: false,
    },
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 43.465,
    longitude: -80.522,
  });

  const providerRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("api.mapbox.com") || url.includes("maps.googleapis.com")) {
      providerRequests.push(url);
    }
  });

  await page.goto("/");
  await expect(
    page.getByText("Centered on your current area."),
  ).toBeVisible();
  await expect(
    page.getByText("Interactive map is unavailable. Showing available clinic locations."),
  ).toBeVisible();
  const clinicCard = page
    .locator("button")
    .filter({ has: page.getByRole("heading", { name: e2eSiteName }) });
  await expect(clinicCard).toContainText("0.2 km");
  expect(providerRequests).toHaveLength(0);
});

test("loads the provider map and keeps marker, clinic, and refresh selection in sync", async ({
  page,
  context,
}) => {
  await prisma.mapProviderConfig.update({
    where: { provider: "mapbox" },
    data: {
      isEnabled: true,
      monthlyMapLoadLimit: 5,
      monthlyPlacesSearchLimit: 0,
      hardStopEnabled: true,
    },
  });
  await prisma.mapSearchCache.upsert({
    where: {
      provider_queryKey: {
        provider: "mapbox",
        queryKey: getMapSearchQueryKey("mapbox", 43.465, -80.522, 5000),
      },
    },
    update: {
      responseJson: [
        {
          id: "mapbox:e2e-provider-care",
          providerPlaceId: "e2e-provider-care",
          name: "Provider Urgent Care",
          address: "2 Provider Way, Waterloo, ON",
          latitude: 43.466,
          longitude: -80.523,
          qdocSiteId: null,
        },
      ],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    create: {
      provider: "mapbox",
      queryKey: getMapSearchQueryKey("mapbox", 43.465, -80.522, 5000),
      responseJson: [
        {
          id: "mapbox:e2e-provider-care",
          providerPlaceId: "e2e-provider-care",
          name: "Provider Urgent Care",
          address: "2 Provider Way, Waterloo, ON",
          latitude: 43.466,
          longitude: -80.523,
          qdocSiteId: null,
        },
      ],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 43.465,
    longitude: -80.522,
  });
  await installMapboxStub(page);

  await page.goto("/");
  await expect(page.getByTestId("mapbox-surface")).toBeVisible();
  await expect(page.getByText("Interactive map is unavailable. Showing available clinic locations.")).toHaveCount(0);
  await page.getByLabel("Select Provider Urgent Care").click();
  await expect(page.getByText("Provider Urgent Care")).toBeVisible();
  await expect(page.getByText("2 Provider Way, Waterloo, ON")).toBeVisible();

  await page.getByLabel("Select E2E Clinic").click();
  await expect(page.getByText("1 E2E Way, Waterloo, ON").first()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = (window as Window & { __qdocMapboxEvents?: Array<{ type: string; center?: [number, number] }> })
          .__qdocMapboxEvents ?? [];
        return events.some((event) => event.type === "flyTo" && event.center?.[0] === -80.5204 && event.center?.[1] === 43.4643);
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("mapbox-surface")).toBeVisible();
  await expect(page.getByText("1 E2E Way, Waterloo, ON").first()).toBeVisible();
});

test("lets staff close a queue and blocks patient check-ins", async ({
  page,
}) => {
  await page.goto("/staff");
  await signIn(page, "Staff email");
  await expect(
    page.getByRole("heading", { name: "Staff queue board" }),
  ).toBeVisible();
  await selectE2eSite(page);

  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Map budget" })).toHaveCount(0);
  const mapSettingsUpdate = await page.evaluate(async () => {
    const response = await fetch("/api/staff/map-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "mapbox",
        isEnabled: true,
        hardStopEnabled: true,
        monthlyMapLoadLimit: 10,
      }),
    });

    return {
      body: await response.json(),
      status: response.status,
    };
  });
  expect(mapSettingsUpdate).toMatchObject({
    body: { error: "forbidden" },
    status: 403,
  });

  await expect(page.getByText("Open to check-ins")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Closed to check-ins")).toBeVisible();

  await page.goto("/");
  await selectE2eSite(page);
  await expect(
    page.getByText("All queues are closed. Choose another clinic or check back later."),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: new RegExp(e2eQueueName) })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Queue closed" })).toBeDisabled();
  const closedCheckIn = await page.evaluate(async (queueId) => {
    const response = await fetch("/api/sites/site-e2e-playwright/check-ins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queueId }),
    });

    return {
      body: await response.json(),
      status: response.status,
    };
  }, e2eQueueId);
  expect(closedCheckIn).toMatchObject({
    body: { error: "queue_closed" },
    status: 409,
  });

  await page.goto("/staff");
  await selectE2eSite(page);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Open to check-ins")).toBeVisible();
});

test("shows launch-safe empty staff board states", async ({ page }) => {
  await page.goto("/staff");
  await signIn(page, "Staff email");
  await selectE2eSite(page);

  await expect(page.getByText("0 active tickets")).toBeVisible();
  await expect(staffColumn(page, "Waiting")).toContainText("No patients waiting.");
  await expect(staffColumn(page, "Delayed")).toContainText("No delayed patients.");
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
});

test("explains staff access when the signed-in email is not on a staff roster", async ({
  page,
}) => {
  await prisma.membership.deleteMany({ where: { siteId: e2eSiteId } });

  await page.goto("/staff");
  await signIn(page, "Staff email");

  await expect(page.getByRole("heading", { name: "Staff access required" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${e2eEmail}`)).toBeVisible();
  await expect(page.getByText("A site admin must add this exact email before the queue board is available.")).toBeVisible();
  await expect(page.getByText("No staff roster match.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue board", exact: true })).toHaveCount(0);
});

test("lets an admin add a staff tester through membership management", async ({
  page,
}, testInfo) => {
  const testerEmail = getE2eMemberEmail();

  await page.goto("/staff");
  await signIn(page, "Staff email");
  await expect(
    page.getByRole("heading", { name: "Staff queue board" }),
  ).toBeVisible();
  await selectE2eSite(page);

  const membershipSection = page.getByRole("heading", { name: "Staff membership" }).locator("../..");

  await expect(membershipSection).toBeVisible();
  await membershipSection.getByPlaceholder("Staff email").fill(testerEmail);
  await membershipSection.getByRole("combobox").selectOption("staff");
  await membershipSection.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Staff membership saved.")).toBeVisible();
  await expect(membershipSection).toContainText(testerEmail);
  await expect(membershipSection).toContainText("staff");

  await expect
    .poll(async () => {
      const membership = await prisma.membership.findFirst({
        where: {
          siteId: e2eSiteId,
          user: { email: testerEmail },
        },
        select: { role: true },
      });

      return membership?.role ?? null;
    })
    .toBe("staff");

  await page.getByLabel("Sign out").click();
  const staffSession = page.getByRole("heading", { name: "Staff session" }).locator("../../..");

  await expect(staffSession.getByText("Sign in with email OTP.")).toBeVisible();
  await expect(staffSession.getByPlaceholder("Staff email")).toBeVisible();

  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo, 1),
  });
  await signIn(page, "Staff email", testerEmail);
  await expect(
    page.getByRole("heading", { name: "Staff queue board" }),
  ).toBeVisible();
  await selectE2eSite(page);
  await expect(page.getByText("0 active tickets")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff membership" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Map budget" })).toHaveCount(0);
});

test("covers patient check-in and staff queue transitions", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo, 1),
  });

  await page.goto("/");
  await signIn(page, "you@example.com");
  await selectE2eSite(page);
  await page.getByRole("radio", { name: new RegExp(e2eQueueName) }).check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Check-in complete.")).toBeVisible();
  await expect(patientTicket(page)).toContainText("Waiting");

  await page.getByLabel("Sign out").click();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();

  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo, 2),
  });
  await page.goto("/staff");
  await signIn(page, "Staff email");
  await expect(
    page.getByRole("heading", { name: "Staff queue board" }),
  ).toBeVisible();
  await selectE2eSite(page);

  const waiting = staffColumn(page, "Waiting");
  await expect(waiting).toContainText(e2eQueueName);
  await waiting.getByRole("button", { name: "Call" }).click();

  const called = staffColumn(page, "Called");
  await expect(called).toContainText(e2eQueueName);
  await expectPatientStatus(page, "Called");

  await page.goto("/staff");
  await selectE2eSite(page);
  await staffColumn(page, "Called")
    .getByRole("button", { name: "Delay" })
    .click();
  await expect(staffColumn(page, "Delayed")).toContainText(e2eQueueName);
  await expectPatientStatus(page, "Delayed");

  await page.goto("/staff");
  await selectE2eSite(page);
  await staffColumn(page, "Delayed")
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(staffColumn(page, "Waiting")).toContainText(e2eQueueName);

  await staffColumn(page, "Waiting")
    .getByRole("button", { name: "Call" })
    .click();
  await expect(staffColumn(page, "Called")).toContainText(e2eQueueName);
  await staffColumn(page, "Called")
    .getByRole("button", { name: "Start" })
    .click();
  await expect(staffColumn(page, "In service")).toContainText(e2eQueueName);
  await expectPatientStatus(page, "In service");

  await page.goto("/staff");
  await selectE2eSite(page);
  await staffColumn(page, "In service")
    .getByRole("button", { name: "Complete" })
    .click();
  await expect(page.getByText("0 active tickets")).toBeVisible();
  await expect(staffColumn(page, "In service")).toContainText("No patients in service.");
  await expectLatestE2eTicketStatus("completed");

  await page.goto("/");
  await expect(page.getByText("No active tickets.")).toBeVisible();
});
