import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "qdoc-health" },
    update: {},
    create: {
      id: "qdoc-health",
      name: "QDoc Health",
    },
  });

  const downtown = await prisma.site.upsert({
    where: { id: "site-downtown" },
    update: {},
    create: {
      id: "site-downtown",
      name: "Downtown Clinic",
      organizationId: organization.id,
    },
  });

  const northside = await prisma.site.upsert({
    where: { id: "site-northside" },
    update: {},
    create: {
      id: "site-northside",
      name: "Northside Clinic",
      organizationId: organization.id,
    },
  });

  await prisma.queue.upsert({
    where: { id: "queue-downtown-general" },
    update: {},
    create: {
      id: "queue-downtown-general",
      name: "General Check-in",
      siteId: downtown.id,
    },
  });

  await prisma.queue.upsert({
    where: { id: "queue-northside-walkin" },
    update: {},
    create: {
      id: "queue-northside-walkin",
      name: "Walk-in Care",
      siteId: northside.id,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: {},
    create: {
      email: "staff@example.com",
    },
  });

  await prisma.membership.upsert({
    where: { userId_siteId: { userId: staff.id, siteId: downtown.id } },
    update: { role: "admin" },
    create: {
      userId: staff.id,
      siteId: downtown.id,
      role: "admin",
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
