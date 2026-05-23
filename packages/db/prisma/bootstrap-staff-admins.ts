import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultStaffAdminEmail = "staff@example.com";
const productionLikeAppEnvs = new Set(["staging", "production"]);

class BootstrapInputError extends Error {
  constructor(public readonly status: string) {
    super(status);
  }
}

function parseList(value: string | undefined) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isProductionLikeBootstrap() {
  return process.env.NODE_ENV === "production" || productionLikeAppEnvs.has((process.env.APP_ENV ?? "").toLowerCase());
}

function isPlaceholderStaffEmail(value: string) {
  return value === defaultStaffAdminEmail || /@(example\.com|example\.org|example\.net)$/i.test(value);
}

function getStaffAdminEmails() {
  const emails = parseList(process.env.QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS ?? process.env.QDOC_SEED_STAFF_ADMIN_EMAILS);

  if (emails.length === 0) {
    throw new BootstrapInputError("staff_admin_emails_required");
  }

  if (emails.some((email) => !isEmailLike(email))) {
    throw new BootstrapInputError("invalid_staff_admin_email_entries");
  }

  if (isProductionLikeBootstrap() && emails.some(isPlaceholderStaffEmail)) {
    throw new BootstrapInputError("placeholder_staff_admin_emails_forbidden");
  }

  return emails;
}

function getRequestedSiteIds() {
  return parseList(process.env.QDOC_BOOTSTRAP_STAFF_SITE_IDS ?? process.env.QDOC_ADMIN_DATA_EXPECT_SITE_IDS);
}

function isDryRun() {
  return process.env.QDOC_BOOTSTRAP_STAFF_DRY_RUN === "true";
}

function assertApplyConfirmed(dryRun: boolean) {
  if (dryRun || !isProductionLikeBootstrap()) {
    return;
  }

  if (process.env.QDOC_BOOTSTRAP_STAFF_CONFIRM !== "apply") {
    throw new BootstrapInputError("staff_admin_bootstrap_apply_confirmation_required");
  }
}

async function main() {
  const emails = getStaffAdminEmails();
  const requestedSiteIds = getRequestedSiteIds();
  const dryRun = isDryRun();
  assertApplyConfirmed(dryRun);

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

  const existingBySiteAndEmail = new Map<string, { id: string; role: string }>();

  for (const site of sites) {
    for (const membership of site.memberships) {
      existingBySiteAndEmail.set(`${site.id}:${membership.user.email.toLowerCase()}`, {
        id: membership.id,
        role: membership.role,
      });
    }
  }

  const plan = sites.map((site) => {
    const created = emails.filter((email) => !existingBySiteAndEmail.has(`${site.id}:${email}`)).length;
    const promoted = emails.filter((email) => existingBySiteAndEmail.get(`${site.id}:${email}`)?.role === "staff").length;
    const unchanged = emails.filter((email) => existingBySiteAndEmail.get(`${site.id}:${email}`)?.role === "admin").length;

    return {
      siteId: site.id,
      created,
      promoted,
      unchanged,
    };
  });

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
      {
        ok: true,
        dryRun,
        emailCount: emails.length,
        siteCount: sites.length,
        requestedSiteCount: requestedSiteIds.length,
        changes: {
          created: plan.reduce((total, item) => total + item.created, 0),
          promoted: plan.reduce((total, item) => total + item.promoted, 0),
          unchanged: plan.reduce((total, item) => total + item.unchanged, 0),
        },
        sites: plan,
      },
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
