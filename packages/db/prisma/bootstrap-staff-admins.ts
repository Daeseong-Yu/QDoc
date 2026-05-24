import { PrismaClient } from "@prisma/client";

import {
  BootstrapInputError,
  buildStaffAdminBootstrapPlan,
  buildStaffAdminBootstrapSuccessOutput,
  indexStaffAdminMembershipsBySiteAndEmail,
  resolveStaffAdminBootstrapConfig,
} from "./bootstrap-staff-admins-core.js";

const prisma = new PrismaClient();

async function main() {
  const { emails, requestedSiteIds, dryRun } = resolveStaffAdminBootstrapConfig();

  const sites = await prisma.site.findMany({
    where: requestedSiteIds.length > 0 ? { id: { in: requestedSiteIds } } : {},
    select: {
      id: true,
      memberships: {
        where: {
          user: {
            email: {
              in: emails,
            },
          },
        },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const foundSiteIds = new Set(sites.map((site) => site.id));
  const missingSiteIds = requestedSiteIds.filter((siteId) => !foundSiteIds.has(siteId));

  if (sites.length === 0 || missingSiteIds.length > 0) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "staff_admin_bootstrap_failed",
        status: sites.length === 0 ? "no_sites_found" : "requested_sites_missing",
        requestedSiteCount: requestedSiteIds.length,
        missingSiteIds,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const existingBySiteAndEmail = indexStaffAdminMembershipsBySiteAndEmail(sites);
  const plan = buildStaffAdminBootstrapPlan(sites, emails);

  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const site of sites) {
        for (const email of emails) {
          const user = await tx.user.upsert({
            where: { email },
            update: {},
            create: { email },
          });
          const before = existingBySiteAndEmail.get(`${site.id}:${email}`)?.role ?? null;
          const membership = await tx.membership.upsert({
            where: {
              userId_siteId: {
                userId: user.id,
                siteId: site.id,
              },
            },
            update: {
              role: "admin",
            },
            create: {
              userId: user.id,
              siteId: site.id,
              role: "admin",
            },
          });

          if (before !== "admin") {
            await tx.auditLog.create({
              data: {
                actorId: null,
                action: before === null ? "membership.bootstrap_admin_create" : "membership.bootstrap_admin_promote",
                metadata: {
                  siteId: site.id,
                  membershipId: membership.id,
                  before: before === null ? null : { role: before },
                  after: { role: "admin" },
                  source: "staff_admin_bootstrap",
                },
              },
            });
          }
        }
      }
    });
  }

  console.log(
    JSON.stringify(
      buildStaffAdminBootstrapSuccessOutput({
        dryRun,
        emailCount: emails.length,
        requestedSiteCount: requestedSiteIds.length,
        plan,
      }),
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: "staff_admin_bootstrap_failed",
        status: error instanceof BootstrapInputError ? error.status : "database_or_query_failed",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
