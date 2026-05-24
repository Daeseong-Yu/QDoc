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
const almostReadyMessage = "Your turn is coming up. Please stay nearby.";
const notificationOutboxTypes = ["ticket.status_changed", "ticket.almost_ready_email"];

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

function getE2ePatientEmail(testInfo: TestInfo, suffix: string) {
  const token = createHash("sha256").update(`${testInfo.project.name}-${testInfo.title}-${suffix}`).digest("hex").slice(0, 12);

  return `e2e.patient.${token}@example.com`;
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

async function installMapboxStub(page: Page, options: { failFirstScriptLoad?: boolean } = {}) {
  await page.route("https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css", async (route) => {
    await route.fulfill({
      contentType: "text/css",
      headers: { "cache-control": "no-store" },
      body: ".mapboxgl-map{position:absolute;inset:0}",
    });
  });
  let shouldFailScriptLoad = options.failFirstScriptLoad ?? false;
  await page.route("https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js*", async (route) => {
    if (shouldFailScriptLoad) {
      shouldFailScriptLoad = false;
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      contentType: "application/javascript",
      headers: { "cache-control": "no-store" },
      body: `
        window.__qdocMapboxEvents = [];
        window.mapboxgl = {
          accessToken: "",
          Map: class {
            constructor(options) {
              this._container = options.container;
              this._zoom = options.zoom;
              window.__qdocMapboxEvents.push({ type: "map", center: options.center, zoom: options.zoom });
              const surface = document.createElement("div");
              surface.dataset.testid = "mapbox-surface";
              surface.style.position = "absolute";
              surface.style.inset = "0";
              surface.style.pointerEvents = "none";
              this._container.appendChild(surface);
            }
            addControl(control, position) {
              window.__qdocMapboxEvents.push({ type: "addControl", position });
            }
            flyTo(options) {
              this._zoom = options.zoom ?? this._zoom;
              window.__qdocMapboxEvents.push({ type: "flyTo", center: options.center, zoom: options.zoom });
            }
            getZoom() {
              return this._zoom;
            }
            panBy(offset) {
              window.__qdocMapboxEvents.push({ type: "panBy", offset });
            }
            remove() {
              this._container.replaceChildren();
            }
            setZoom(zoom) {
              this._zoom = zoom;
              window.__qdocMapboxEvents.push({ type: "setZoom", zoom });
            }
          },
          Marker: class {
            constructor(options = {}) {
              this._element = options.element || document.createElement("div");
              this._element.dataset.testid = this._element.dataset.testid || "mapbox-marker";
              if (options.color) {
                this._element.dataset.markerColor = options.color;
              }
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
              const markerIndex = map._container.querySelectorAll('[data-testid$="map-marker"]').length;
              this._element.style.position = "absolute";
              this._element.style.left = markerIndex % 2 === 0 ? "48%" : "58%";
              this._element.style.top = markerIndex % 2 === 0 ? "48%" : "55%";
              this._element.style.transform = "translate(-50%, -50%)";
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

  await prisma.outbox.deleteMany({
    where: {
      type: { in: notificationOutboxTypes },
      OR: [
        { payload: { path: ["siteId"], equals: e2eSiteId } },
        ...ticketIds.map((ticketId) => ({ payload: { path: ["ticketId"], equals: ticketId } })),
      ],
    },
  });

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
    update: { emailNotificationsEnabled: true },
    create: { email: e2eEmail, emailNotificationsEnabled: true },
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
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
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

async function createWaitingTicket(email: string, sortRank: Date) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      emailNotificationsEnabled: true,
    },
    create: {
      email,
      emailNotificationsEnabled: true,
    },
  });

  return prisma.ticket.create({
    data: {
      siteId: e2eSiteId,
      queueId: e2eQueueId,
      userId: user.id,
      status: "waiting",
      sortRank,
      events: {
        create: {
          status: "waiting",
          note: "e2e_seed",
        },
      },
    },
    select: {
      id: true,
    },
  });
}

function getPayloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

async function countAlmostReadyEmailOutboxes(ticketId: string) {
  const outboxes = await prisma.outbox.findMany({
    where: { type: "ticket.almost_ready_email" },
    select: { payload: true },
  });

  return outboxes.filter((outbox) => getPayloadString(outbox.payload, "ticketId") === ticketId).length;
}

async function getTicketStatus(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true },
  });

  return ticket?.status ?? null;
}

async function expectNoRawAuthErrorCodes(page: Page) {
  const body = page.locator("body");

  await expect(body).not.toContainText("otp_delivery_unavailable");
  await expect(body).not.toContainText("rate_limited");
  await expect(body).not.toContainText("invalid_otp");
  await expect(body).not.toContainText("expired_otp");
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

test("renders patient-friendly OTP errors without exposing auth error codes", async ({
  page,
}) => {
  await page.route(
    "**/api/auth/otp/request",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "otp_delivery_unavailable", retryAfterSeconds: 60 }),
      });
    },
    { times: 1 },
  );

  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(e2eEmail);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We could not send a code right now. Try again in 1 minute.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.route(
    "**/api/auth/otp/request",
    async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited", retryAfterSeconds: 65 }),
      });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Too many attempts. Try again in 2 minutes.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.route(
    "**/api/auth/otp/request",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Enter the verification code sent to your email.")).toBeVisible();

  await page.route(
    "**/api/auth/otp/verify",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_otp" }),
      });
    },
    { times: 1 },
  );
  await page.getByPlaceholder("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter the latest 6-digit verification code.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.route(
    "**/api/auth/otp/verify",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "expired_otp" }),
      });
    },
    { times: 1 },
  );
  await page.getByPlaceholder("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That code expired. Request a new code.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);
});

test("renders staff-friendly OTP errors without exposing auth error codes", async ({
  page,
}) => {
  await page.route(
    "**/api/auth/otp/request",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "otp_delivery_unavailable", retryAfterSeconds: 30 }),
      });
    },
    { times: 1 },
  );

  await page.goto("/staff");
  await page.getByPlaceholder("Staff email").fill(e2eEmail);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We could not send a code right now. Try again in 30 seconds.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.route(
    "**/api/auth/otp/request",
    async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited", retryAfterSeconds: 45 }),
      });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Too many attempts. Try again in 45 seconds.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.route(
    "**/api/auth/otp/request",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Enter the verification code sent to your email.")).toBeVisible();
  await expect(page.getByTestId("staff-auth-controls")).toHaveAttribute("data-auth-step", "code");
  await expect(page.getByPlaceholder("Staff email")).toBeVisible();
  const staffOtpInputWidth = await page.getByPlaceholder("6-digit code").evaluate((element) => element.getBoundingClientRect().width);
  expect(staffOtpInputWidth).toBeLessThanOrEqual(180);

  await page.route(
    "**/api/auth/otp/verify",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_otp" }),
      });
    },
    { times: 1 },
  );
  await page.getByPlaceholder("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter the latest 6-digit verification code.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.route(
    "**/api/auth/otp/verify",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "expired_otp" }),
      });
    },
    { times: 1 },
  );
  await page.getByPlaceholder("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That code expired. Request a new code.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);
});

test("rejects expired OTP codes with readable copy", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo, 1),
  });

  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(e2eEmail);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Enter the verification code sent to your email.")).toBeVisible();
  await prisma.otpChallenge.updateMany({
    where: {
      email: e2eEmail,
      verifiedAt: null,
    },
    data: {
      codeHash: hashOtpForTest(e2eEmail, e2eOtpCode),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  await page.getByPlaceholder("6-digit code").fill(e2eOtpCode);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That code expired. Request a new code.")).toBeVisible();
  await expectNoRawAuthErrorCodes(page);

  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/Too many attempts\. Try again in \d+ seconds?\./)).toBeVisible();
  await expectNoRawAuthErrorCodes(page);
});

test("keeps signed-in sessions across refresh and revisit", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo, 1),
  });

  await page.goto("/");
  await signIn(page, "you@example.com");
  await page.reload();
  await expect(page.getByText(e2eEmail, { exact: true })).toBeVisible();

  await selectE2eSite(page);
  await page.getByRole("radio", { name: new RegExp(e2eQueueName) }).check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Check-in complete.")).toBeVisible();
  await expect(patientTicket(page)).toContainText("Waiting");

  await page.reload();
  await expect(patientTicket(page)).toContainText("Waiting");

  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Staff queue board" })).toBeVisible();
  await selectE2eSite(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Staff queue board" })).toBeVisible();
  await expect(page.getByText(e2eEmail, { exact: true })).toBeVisible();
});

test("lets patients change notification preferences", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": getE2eRequesterIp(testInfo, 1),
  });

  await page.goto("/");
  await signIn(page, "you@example.com");

  const alerts = page.getByLabel("Alerts");
  await expect(alerts).toBeChecked();
  await expect(alerts).toBeEnabled();
  const preferencesResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/patients/me/notification-preferences") &&
      response.request().method() === "PATCH",
  );
  await alerts.click();
  expect((await preferencesResponse).ok()).toBe(true);
  await expect(alerts).not.toBeChecked();
  await expect
    .poll(async () => {
      const user = await prisma.user.findUnique({
        where: { email: e2eEmail },
        select: { emailNotificationsEnabled: true },
      });

      return user?.emailNotificationsEnabled ?? null;
    })
    .toBe(false);

  await page.reload();
  await expect(page.getByText(e2eEmail, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Alerts")).not.toBeChecked();
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
    page.getByText("Showing clinic locations."),
  ).toBeVisible();
  await expect(page.getByTestId("clinic-map-zoom-in")).toBeVisible();
  await expect(page.getByTestId("clinic-map-zoom-out")).toBeVisible();
  await expect(page.getByTestId("clinic-map-fallback-recenter")).toBeVisible();
  const fallbackPanCount = Number(await page.getByTestId("clinic-map-section").getAttribute("data-fallback-pan-count"));
  await page.getByTestId("clinic-map-pan-right").click();
  await expect
    .poll(() =>
      page.getByTestId("clinic-map-section").evaluate((element) => Number(element.getAttribute("data-fallback-pan-count"))),
    )
    .toBeGreaterThan(fallbackPanCount);
  await page.getByTestId("clinic-map-zoom-in").click();
  await page.getByTestId("clinic-map-zoom-out").click();
  await page.getByTestId("clinic-map-fallback-recenter").click();
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
  let mapConfigRequests = 0;
  let nearbyHealthcareRequests = 0;
  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("/api/maps/config")) {
      mapConfigRequests += 1;
    }

    if (url.includes("/api/maps/nearby-healthcare")) {
      nearbyHealthcareRequests += 1;
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("mapbox-surface")).toBeVisible();
  await expect(page.getByText("Showing clinic locations.")).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = (window as Window & { __qdocMapboxEvents?: Array<{ type: string; position?: string }> })
          .__qdocMapboxEvents ?? [];
        return events.some((event) => event.type === "addControl" && event.position === "top-right");
      }),
    )
    .toBe(true);
  expect(nearbyHealthcareRequests).toBeGreaterThanOrEqual(1);
  expect(mapConfigRequests).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("clinic-map-provider-zoom-in")).toBeVisible();
  await expect(page.getByTestId("clinic-map-provider-zoom-out")).toBeVisible();
  await expect(page.getByTestId("clinic-map-provider-pan-right")).toBeVisible();

  const providerMarker = page.getByLabel("Select Provider Urgent Care");
  const qdocMarker = page.getByLabel("Select E2E Clinic");
  await expect(qdocMarker).toHaveAttribute("aria-pressed", "true");
  await expect(providerMarker).toHaveAttribute("aria-pressed", "false");
  await expect(qdocMarker).toHaveCSS("background-color", "rgb(16, 185, 196)");
  await expect(providerMarker).toHaveCSS("background-color", "rgb(71, 85, 105)");

  await providerMarker.click();
  await expect(page.getByText("Provider Urgent Care")).toBeVisible();
  await expect(page.getByText("2 Provider Way, Waterloo, ON")).toBeVisible();
  await expect(providerMarker).toHaveAttribute("aria-pressed", "true");
  await expect(qdocMarker).toHaveAttribute("aria-pressed", "false");
  await expect(providerMarker).toHaveCSS("background-color", "rgb(16, 185, 196)");
  await expect(qdocMarker).toHaveCSS("background-color", "rgb(8, 120, 132)");

  await qdocMarker.click();
  await expect(page.getByText("1 E2E Way, Waterloo, ON").first()).toBeVisible();
  await expect(qdocMarker).toHaveAttribute("aria-pressed", "true");
  await expect(providerMarker).toHaveAttribute("aria-pressed", "false");
  await expect(qdocMarker).toHaveCSS("background-color", "rgb(16, 185, 196)");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = (window as Window & { __qdocMapboxEvents?: Array<{ type: string; center?: [number, number] }> })
          .__qdocMapboxEvents ?? [];
        return events.some((event) => event.type === "flyTo" && event.center?.[0] === -80.5204 && event.center?.[1] === 43.4643);
      }),
    )
    .toBe(true);

  await page.getByTestId("clinic-map-provider-pan-right").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = (window as Window & { __qdocMapboxEvents?: Array<{ type: string; offset?: [number, number] }> })
          .__qdocMapboxEvents ?? [];
        return events.some((event) => event.type === "panBy" && event.offset?.[0] === 80 && event.offset?.[1] === 0);
      }),
    )
    .toBe(true);

  await page.getByTestId("clinic-map-provider-zoom-in").click();
  await page.getByTestId("clinic-map-provider-zoom-out").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = (window as Window & { __qdocMapboxEvents?: Array<{ type: string }> }).__qdocMapboxEvents ?? [];
        return events.filter((event) => event.type === "setZoom").length;
      }),
    )
    .toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "Recenter map to your location" }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = (window as Window & { __qdocMapboxEvents?: Array<{ type: string; center?: [number, number] }> })
          .__qdocMapboxEvents ?? [];
        return events.some((event) => event.type === "flyTo" && event.center?.[0] === -80.522 && event.center?.[1] === 43.465);
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("mapbox-surface")).toBeVisible();
  await expect(page.getByText("1 E2E Way, Waterloo, ON").first()).toBeVisible();
  await expect.poll(() => nearbyHealthcareRequests).toBeGreaterThanOrEqual(2);
  await expect.poll(() => mapConfigRequests).toBeGreaterThanOrEqual(2);
});

test("retries provider map SDK loading after a failed script request", async ({
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
  await installMapboxStub(page, { failFirstScriptLoad: true });

  let scriptRequests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith("https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js")) {
      scriptRequests += 1;
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("clinic-map-fallback")).toBeVisible();
  await expect(page.getByTestId("mapbox-surface")).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("mapbox-surface")).toBeVisible();
  await expect(page.getByLabel("Select Provider Urgent Care")).toBeVisible();
  await expect.poll(() => scriptRequests).toBeGreaterThanOrEqual(2);
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
  await expect(page.getByText("Staff access is not set up for this email.")).toBeVisible();
  await expect(page.getByText("Ask a site admin to add this exact email to a staffed location.")).toBeVisible();
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
  await expect(
    staffSession.getByText("Use the staff or admin email added to a site roster."),
  ).toBeVisible();
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

test("renders staff map budget status without exposing raw availability reasons", async ({
  page,
}) => {
  e2eEmail = "e2e.staff@example.com";
  await resetE2eData();

  await page.goto("/staff");
  await signIn(page, "Staff email");
  await expect(
    page.getByRole("heading", { name: "Staff queue board" }),
  ).toBeVisible();
  await selectE2eSite(page);

  const mapBudgetSection = page.getByRole("heading", { name: "Map budget" }).locator("../..");
  await expect(mapBudgetSection).toBeVisible();
  await expect(mapBudgetSection).toContainText("Status: Ready to load public maps");
  await expect(mapBudgetSection).not.toContainText("available");
  await expect(mapBudgetSection).not.toContainText("provider_disabled");
  await expect(mapBudgetSection).not.toContainText("token_missing");
  await expect(mapBudgetSection).not.toContainText("budget_exhausted");
});

test("lets admins update memberships while preserving one site admin", async ({
  page,
}, testInfo) => {
  const testerEmail = getE2eMemberEmail(`${e2eEmail}-${testInfo.retry}`);

  await page.goto("/staff");
  await signIn(page, "Staff email");
  await expect(
    page.getByRole("heading", { name: "Staff queue board" }),
  ).toBeVisible();
  await selectE2eSite(page);

  const membershipSection = page.getByRole("heading", { name: "Staff membership" }).locator("../..");
  const membershipRow = (email: string) =>
    membershipSection.getByLabel(`Remove ${email}`).locator("../..");

  await membershipSection.getByPlaceholder("Staff email").fill(testerEmail);
  await membershipSection.getByRole("combobox").selectOption("staff");
  await membershipSection.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Staff membership saved.")).toBeVisible();

  await membershipRow(testerEmail).getByRole("button", { name: "Make admin" }).click();
  await expect(page.getByText("Staff role updated.")).toBeVisible();
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
    .toBe("admin");

  await membershipRow(testerEmail).getByRole("button", { name: "Make staff" }).click();
  await expect(page.getByText("Staff role updated.")).toBeVisible();
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

  await membershipSection.getByLabel(`Remove ${testerEmail}`).click();
  await expect(page.getByText("Staff membership removed.")).toBeVisible();
  await expect(membershipSection).not.toContainText(testerEmail);
  await expect
    .poll(async () =>
      prisma.membership.count({
        where: {
          siteId: e2eSiteId,
          user: { email: testerEmail },
        },
      }),
    )
    .toBe(0);

  const auditLog = page.getByRole("heading", { name: "Audit log" }).locator("..");
  await expect(auditLog).toContainText("membership.update");
  await expect(auditLog).toContainText("membership.delete");

  await membershipRow(e2eEmail).getByRole("button", { name: "Make staff" }).click();
  await expect(page.getByText("That change conflicts with the current state. Keep at least one site admin.")).toBeVisible();
  await expect
    .poll(async () => {
      const membership = await prisma.membership.findFirst({
        where: {
          siteId: e2eSiteId,
          user: { email: e2eEmail },
        },
        select: { role: true },
      });

      return membership?.role ?? null;
    })
    .toBe("admin");

  await membershipSection.getByLabel(`Remove ${e2eEmail}`).click();
  await expect(page.getByText("That change conflicts with the current state. Keep at least one site admin.")).toBeVisible();
  await expect
    .poll(async () =>
      prisma.membership.count({
        where: {
          siteId: e2eSiteId,
          user: { email: e2eEmail },
        },
      }),
    )
    .toBe(1);
});

test("shows staff notification health, almost-ready outbox evidence, cancel flow, and audit logs", async ({
  page,
}, testInfo) => {
  await prisma.site.update({
    where: { id: e2eSiteId },
    data: { notificationAheadCount: 1 },
  });

  const now = Date.now();
  const frontTicket = await createWaitingTicket(getE2ePatientEmail(testInfo, "front"), new Date(now));
  const middleTicket = await createWaitingTicket(getE2ePatientEmail(testInfo, "middle"), new Date(now + 1000));
  const almostReadyTicket = await createWaitingTicket(getE2ePatientEmail(testInfo, "almost-ready"), new Date(now + 2000));
  const failedOutbox = await prisma.outbox.create({
    data: {
      type: "ticket.almost_ready_email",
      payload: {
        ticketId: "e2e-failed-notification",
        siteId: e2eSiteId,
        queueId: e2eQueueId,
        notificationLogId: "e2e-failed-notification",
      },
      status: "failed",
      attempts: 5,
    },
    select: { id: true },
  });

  try {
    await page.goto("/staff");
    await signIn(page, "Staff email");
    await expect(page.getByRole("heading", { name: "Staff queue board" })).toBeVisible();
    await selectE2eSite(page);

    const notificationHealth = page.getByRole("heading", { name: "Notification health" }).locator("../..");
    await expect(notificationHealth).toContainText("Failed");
    await expect(notificationHealth).toContainText("1");
    await expect(notificationHealth).toContainText("ticket.almost_ready_email");
    await expect(notificationHealth).toContainText("failed");

    await staffColumn(page, "Waiting").getByRole("button", { name: "Call" }).first().click();
    await expect(staffColumn(page, "Called")).toContainText(e2eQueueName);
    await expect.poll(() => getTicketStatus(frontTicket.id)).toBe("called");
    await expect
      .poll(async () =>
        prisma.notificationLog.count({
          where: {
            ticketId: almostReadyTicket.id,
            channel: "email",
            message: almostReadyMessage,
          },
        }),
      )
      .toBe(1);
    await expect.poll(() => countAlmostReadyEmailOutboxes(almostReadyTicket.id)).toBe(1);

    await staffColumn(page, "Called").getByRole("button", { name: "Delay" }).click();
    await expect(staffColumn(page, "Delayed")).toContainText(e2eQueueName);
    await expect.poll(() => getTicketStatus(frontTicket.id)).toBe("delay");
    await expect.poll(() => countAlmostReadyEmailOutboxes(almostReadyTicket.id)).toBe(1);

    await staffColumn(page, "Waiting").getByRole("button", { name: "Cancel" }).first().click();
    await expect.poll(() => getTicketStatus(middleTicket.id)).toBe("cancelled");
    await expect.poll(() => countAlmostReadyEmailOutboxes(almostReadyTicket.id)).toBe(1);

    const auditLog = page.getByRole("heading", { name: "Audit log" }).locator("..");
    await expect(auditLog).toContainText("ticket.call");
    await expect(auditLog).toContainText("ticket.delay");
    await expect(auditLog).toContainText("ticket.cancel");
  } finally {
    await prisma.outbox.deleteMany({ where: { id: failedOutbox.id } });
  }
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
