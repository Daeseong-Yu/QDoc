import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const clinics = [
  {
    id: "site-waterloo",
    name: "Waterloo Clinic",
    queueId: "queue-waterloo-walkin",
    distanceKm: 1.2,
    addressLine1: "170 University Ave W",
    city: "Waterloo",
    region: "ON",
    postalCode: "N2L 3E9",
    country: "CA",
    latitude: 43.4723,
    longitude: -80.5449,
    waitingCount: 19,
  },
  {
    id: "site-kitchener",
    name: "Kitchener Clinic",
    queueId: "queue-kitchener-walkin",
    distanceKm: 4.8,
    addressLine1: "835 King St W",
    city: "Kitchener",
    region: "ON",
    postalCode: "N2G 1E3",
    country: "CA",
    latitude: 43.4553,
    longitude: -80.5112,
    waitingCount: 5,
  },
  {
    id: "site-university",
    name: "Dental Clinic",
    queueId: "queue-university-walkin",
    distanceKm: 2.4,
    addressLine1: "200 University Ave W",
    city: "Waterloo",
    region: "ON",
    postalCode: "N2L 3G1",
    country: "CA",
    latitude: 43.4715,
    longitude: -80.5454,
    waitingCount: 0,
  },
] as const;

const legacySiteIds = ["site-downtown", "site-northside"];
const defaultStaffAdminEmail = "staff@example.com";
const productionLikeAppEnvs = new Set(["staging", "production"]);

function parseEmailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isProductionLikeSeed() {
  return process.env.NODE_ENV === "production" || productionLikeAppEnvs.has((process.env.APP_ENV ?? "").toLowerCase());
}

function isPlaceholderStaffEmail(value: string) {
  return value === defaultStaffAdminEmail || /@(example\.com|example\.org|example\.net)$/i.test(value);
}

function getSeedStaffAdminEmails() {
  const emails = parseEmailList(process.env.QDOC_SEED_STAFF_ADMIN_EMAILS);
  const productionLike = isProductionLikeSeed();

  if (emails.length === 0) {
    if (productionLike) {
      throw new Error("QDOC_SEED_STAFF_ADMIN_EMAILS is required for staging or production seed");
    }

    return [defaultStaffAdminEmail];
  }

  const staffAdminEmails = [...new Set(emails)];
  const invalidEmails = staffAdminEmails.filter((email) => !isEmailLike(email));

  if (invalidEmails.length > 0) {
    throw new Error("QDOC_SEED_STAFF_ADMIN_EMAILS contains invalid email entries");
  }

  if (productionLike && staffAdminEmails.some(isPlaceholderStaffEmail)) {
    throw new Error("QDOC_SEED_STAFF_ADMIN_EMAILS must use real OTP-receivable staff emails for staging or production seed");
  }

  return staffAdminEmails;
}

const samplePatientEmails = [
  "aiden.park@example.com",
  "maya.chen@example.org",
  "sofia.kim@example.net",
  "noah.patel@example.com",
  "olivia.nguyen@example.org",
  "liam.rodriguez@example.net",
  "emma.wilson@example.com",
  "ethan.lee@example.org",
  "ava.martin@example.net",
  "lucas.brown@example.com",
  "mia.garcia@example.org",
  "henry.davis@example.net",
  "amelia.miller@example.com",
  "james.anderson@example.org",
  "isla.thomas@example.net",
  "logan.moore@example.com",
  "chloe.jackson@example.org",
  "benjamin.white@example.net",
  "harper.harris@example.com",
  "elijah.clark@example.org",
  "ella.lewis@example.net",
  "mason.young@example.com",
  "aria.king@example.org",
  "jack.wright@example.net",
] as const;

function getPatientEmail(siteId: string, index: number) {
  const sampleEmail = samplePatientEmails[index] ?? `patient${String(index + 1).padStart(2, "0")}@example.com`;
  const atIndex = sampleEmail.lastIndexOf("@");
  const localPart = sampleEmail.slice(0, atIndex);
  const domain = sampleEmail.slice(atIndex + 1);

  return `${localPart}.${siteId.replace("site-", "")}@${domain}`;
}

function getSeededTicketId(siteId: string, index: number) {
  return `ticket-${siteId}-${String(index + 1).padStart(2, "0")}`;
}

function getLegacyPatientEmail(siteId: string, index: number) {
  return `customer${String(index + 1).padStart(2, "0")}.${siteId.replace("site-", "")}@example.com`;
}

async function deleteTickets(ticketIds: string[]) {
  if (ticketIds.length === 0) {
    return;
  }

  await prisma.notificationLog.deleteMany({
    where: {
      ticketId: {
        in: ticketIds,
      },
    },
  });
  await prisma.ticketEvent.deleteMany({
    where: {
      ticketId: {
        in: ticketIds,
      },
    },
  });
  await prisma.ticket.deleteMany({
    where: {
      id: {
        in: ticketIds,
      },
    },
  });
}

async function resetSeededTickets() {
  const seededTicketIds = await prisma.ticket.findMany({
    where: {
      OR: clinics.map((clinic) => ({
        id: {
          startsWith: `ticket-${clinic.id}-`,
        },
      })),
    },
    select: {
      id: true,
    },
  });

  await deleteTickets(seededTicketIds.map((ticket) => ticket.id));
}

async function removeLegacySeededPatients() {
  await prisma.user.deleteMany({
    where: {
      email: {
        in: clinics.flatMap((clinic) =>
          Array.from({ length: clinic.waitingCount }, (_, index) => getLegacyPatientEmail(clinic.id, index)),
        ),
      },
      tickets: {
        none: {},
      },
      memberships: {
        none: {},
      },
    },
  });
}

async function removeLegacySites() {
  const legacyTickets = await prisma.ticket.findMany({
    where: {
      siteId: {
        in: legacySiteIds,
      },
    },
    select: {
      id: true,
    },
  });

  await deleteTickets(legacyTickets.map((ticket) => ticket.id));

  await prisma.membership.deleteMany({
    where: {
      siteId: {
        in: legacySiteIds,
      },
    },
  });
  await prisma.queue.deleteMany({
    where: {
      siteId: {
        in: legacySiteIds,
      },
    },
  });
  await prisma.site.deleteMany({
    where: {
      id: {
        in: legacySiteIds,
      },
    },
  });
}

async function seedClinicTickets(siteId: string, queueId: string, waitingCount: number) {
  const baseTime = Date.now() - waitingCount * 60_000;

  for (let index = 0; index < waitingCount; index += 1) {
    const email = getPatientEmail(siteId, index);
    const patient = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
      },
    });
    const checkedInAt = new Date(baseTime + index * 60_000);

    await prisma.ticket.create({
      data: {
        id: getSeededTicketId(siteId, index),
        siteId,
        queueId,
        userId: patient.id,
        status: "waiting",
        sortRank: checkedInAt,
        createdAt: checkedInAt,
        events: {
          create: {
            status: "waiting",
            note: "seed.waiting",
            createdAt: checkedInAt,
          },
        },
      },
    });
  }
}

async function main() {
  const staffAdminEmails = getSeedStaffAdminEmails();

  const organization = await prisma.organization.upsert({
    where: { id: "qdoc-health" },
    update: {},
    create: {
      id: "qdoc-health",
      name: "QDoc Health",
    },
  });

  await removeLegacySites();
  await resetSeededTickets();
  await removeLegacySeededPatients();

  const staffAdmins = await Promise.all(
    staffAdminEmails.map((email) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
        },
      }),
    ),
  );

  for (const clinic of clinics) {
    const site = await prisma.site.upsert({
      where: { id: clinic.id },
      update: {
        name: clinic.name,
        distanceKm: clinic.distanceKm,
        addressLine1: clinic.addressLine1,
        city: clinic.city,
        region: clinic.region,
        postalCode: clinic.postalCode,
        country: clinic.country,
        latitude: clinic.latitude,
        longitude: clinic.longitude,
        locationSource: "seed",
        locationVerifiedAt: new Date("2026-05-20T00:00:00.000Z"),
        organizationId: organization.id,
      },
      create: {
        id: clinic.id,
        name: clinic.name,
        distanceKm: clinic.distanceKm,
        addressLine1: clinic.addressLine1,
        city: clinic.city,
        region: clinic.region,
        postalCode: clinic.postalCode,
        country: clinic.country,
        latitude: clinic.latitude,
        longitude: clinic.longitude,
        locationSource: "seed",
        locationVerifiedAt: new Date("2026-05-20T00:00:00.000Z"),
        organizationId: organization.id,
      },
    });

    await prisma.queue.upsert({
      where: { id: clinic.queueId },
      update: {
        name: "Walk-in Care",
        siteId: site.id,
        isOpen: true,
      },
      create: {
        id: clinic.queueId,
        name: "Walk-in Care",
        siteId: site.id,
      },
    });

    for (const staffAdmin of staffAdmins) {
      await prisma.membership.upsert({
        where: { userId_siteId: { userId: staffAdmin.id, siteId: site.id } },
        update: { role: "admin" },
        create: {
          userId: staffAdmin.id,
          siteId: site.id,
          role: "admin",
        },
      });
    }

    await seedClinicTickets(site.id, clinic.queueId, clinic.waitingCount);
  }

  await prisma.mapProviderConfig.upsert({
    where: { provider: "mapbox" },
    update: {},
    create: {
      provider: "mapbox",
      isEnabled: false,
      monthlyMapLoadLimit: 0,
      hardStopEnabled: true,
    },
  });

  await prisma.mapProviderConfig.upsert({
    where: { provider: "google" },
    update: {},
    create: {
      provider: "google",
      isEnabled: false,
      monthlyMapLoadLimit: 0,
      hardStopEnabled: true,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
