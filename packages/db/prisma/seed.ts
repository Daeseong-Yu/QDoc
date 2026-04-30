import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const clinics = [
  {
    id: "site-waterloo",
    name: "Waterloo Clinic",
    queueId: "queue-waterloo-walkin",
    distanceKm: 1.2,
    waitingCount: 19,
  },
  {
    id: "site-kitchener",
    name: "Kitchener Clinic",
    queueId: "queue-kitchener-walkin",
    distanceKm: 4.8,
    waitingCount: 5,
  },
  {
    id: "site-university",
    name: "Dental Clinic",
    queueId: "queue-university-walkin",
    distanceKm: 2.4,
    waitingCount: 0,
  },
] as const;

const legacySiteIds = ["site-downtown", "site-northside"];

function getPatientEmail(siteId: string, index: number) {
  return `customer${String(index + 1).padStart(2, "0")}.${siteId.replace("site-", "")}@example.com`;
}

function getSeededTicketId(siteId: string, index: number) {
  return `ticket-${siteId}-${String(index + 1).padStart(2, "0")}`;
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

  const staff = await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: {},
    create: {
      email: "staff@example.com",
    },
  });

  for (const clinic of clinics) {
    const site = await prisma.site.upsert({
      where: { id: clinic.id },
      update: {
        name: clinic.name,
        distanceKm: clinic.distanceKm,
        organizationId: organization.id,
      },
      create: {
        id: clinic.id,
        name: clinic.name,
        distanceKm: clinic.distanceKm,
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

    await prisma.membership.upsert({
      where: { userId_siteId: { userId: staff.id, siteId: site.id } },
      update: { role: "admin" },
      create: {
        userId: staff.id,
        siteId: site.id,
        role: "admin",
      },
    });

    await seedClinicTickets(site.id, clinic.queueId, clinic.waitingCount);
  }
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
