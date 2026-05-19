import { expect, test, type Page } from "@playwright/test";
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
const e2eEmail = "e2e.staff@example.com";
const e2eOtpCode = "123456";

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

  await prisma.otpChallenge.deleteMany({ where: { email: e2eEmail } });
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
}

function staffColumn(page: Page, name: string) {
  return page.locator("section").filter({
    has: page.locator("h3", { hasText: new RegExp(`^${name}$`) }),
  }).last();
}

function patientTicket(page: Page) {
  return page.locator("article").filter({ hasText: e2eSiteName }).first();
}

async function signIn(page: Page, emailPlaceholder: string) {
  await page.getByPlaceholder(emailPlaceholder).fill(e2eEmail);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(
    page.getByText("Enter the verification code sent to your email."),
  ).toBeVisible();
  await page.getByPlaceholder("6-digit code").fill(e2eOtpCode);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in.")).toBeVisible();
}

async function selectE2eSite(page: Page) {
  await page.getByRole("button", { name: new RegExp(e2eSiteName) }).click();
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

test.beforeEach(async () => {
  await resetE2eData();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("covers patient check-in and staff queue transitions", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.10" });

  await page.goto("/");
  await signIn(page, "you@example.com");
  await selectE2eSite(page);
  await page.getByRole("radio", { name: new RegExp(e2eQueueName) }).check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Check-in complete.")).toBeVisible();
  await expect(patientTicket(page)).toContainText("Waiting");

  await page.getByLabel("Sign out").click();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();

  await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.11" });
  await page.goto("/staff");
  await signIn(page, "staff@example.com");
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
  await expect(staffColumn(page, "In service")).toContainText("No tickets.");
  await expectLatestE2eTicketStatus("completed");

  await page.goto("/");
  await expect(page.getByText("No active tickets.")).toBeVisible();
});
