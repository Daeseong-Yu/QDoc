import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: {
      id: "demo-org",
      name: "QDoc Demo Health",
    },
  });

  const downtown = await prisma.site.upsert({
    where: { id: "demo-site-downtown" },
    update: {},
    create: {
      id: "demo-site-downtown",
      name: "Downtown Demo Clinic",
      organizationId: organization.id,
    },
  });

  const northside = await prisma.site.upsert({
    where: { id: "demo-site-northside" },
    update: {},
    create: {
      id: "demo-site-northside",
      name: "Northside Demo Clinic",
      organizationId: organization.id,
    },
  });

  await prisma.queue.upsert({
    where: { id: "demo-queue-downtown-general" },
    update: {},
    create: {
      id: "demo-queue-downtown-general",
      name: "General Check-in",
      siteId: downtown.id,
    },
  });

  await prisma.queue.upsert({
    where: { id: "demo-queue-northside-walkin" },
    update: {},
    create: {
      id: "demo-queue-northside-walkin",
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
