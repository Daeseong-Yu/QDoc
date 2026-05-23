import { prisma } from "@qdoc/db";

type AdminDataCheck = {
  name: string;
  ok: boolean;
  status: string;
  value?: number | string | boolean;
};

const ticketStatuses = ["waiting", "called", "in_service", "completed", "delay", "cancelled"];

function getExpectedSiteIds() {
  return (process.env.QDOC_ADMIN_DATA_EXPECT_SITE_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getExpectedStaffAdminEmails() {
  return [
    ...new Set(
      (process.env.QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function countTicketRows(rows: Array<{ siteId: string; status: string; _count: { _all: number } }>) {
  const counts = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const siteCounts = counts.get(row.siteId) ?? {};
    siteCounts[row.status] = row._count._all;
    counts.set(row.siteId, siteCounts);
  }

  return counts;
}

function completeStatusCounts(counts: Record<string, number> | undefined) {
  return Object.fromEntries(ticketStatuses.map((status) => [status, counts?.[status] ?? 0]));
}

function check(name: string, ok: boolean, readyStatus: string, failedStatus: string, value?: number | string | boolean): AdminDataCheck {
  return {
    name,
    ok,
    status: ok ? readyStatus : failedStatus,
    ...(value === undefined ? {} : { value }),
  };
}

async function main() {
  const expectedSiteIds = getExpectedSiteIds();
  const expectedStaffAdminEmails = getExpectedStaffAdminEmails();

  const [organizationCount, sites, ticketRows, auditLogCount, mapConfigs] = await Promise.all([
    prisma.organization.count(),
    prisma.site.findMany({
      select: {
        id: true,
        name: true,
        addressLine1: true,
        city: true,
        region: true,
        country: true,
        latitude: true,
        longitude: true,
        notificationAheadCount: true,
        queues: {
          select: {
            id: true,
            name: true,
            isOpen: true,
          },
          orderBy: {
            id: "asc",
          },
        },
        memberships: {
          select: {
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
    }),
    prisma.ticket.groupBy({
      by: ["siteId", "status"],
      _count: {
        _all: true,
      },
    }),
    prisma.auditLog.count(),
    prisma.mapProviderConfig.findMany({
      select: {
        provider: true,
        isEnabled: true,
        monthlyMapLoadLimit: true,
        hardStopEnabled: true,
      },
      orderBy: {
        provider: "asc",
      },
    }),
  ]);

  const ticketCountsBySite = countTicketRows(ticketRows);
  const siteIds = new Set(sites.map((site) => site.id));
  const missingExpectedSiteIds = expectedSiteIds.filter((siteId) => !siteIds.has(siteId));
  const sitesWithoutQueues = sites.filter((site) => site.queues.length === 0).map((site) => site.id);
  const sitesWithoutAdmins = sites
    .filter((site) => site.memberships.filter((membership) => membership.role === "admin").length === 0)
    .map((site) => site.id);
  const sitesMissingExpectedStaffAdmins = sites
    .filter((site) =>
      expectedStaffAdminEmails.some(
        (email) =>
          !site.memberships.some((membership) => membership.role === "admin" && membership.user.email.toLowerCase() === email),
      ),
    )
    .map((site) => site.id);
  const sitesWithInvalidNotificationThreshold = sites
    .filter((site) => !Number.isInteger(site.notificationAheadCount) || site.notificationAheadCount < 0)
    .map((site) => site.id);
  const enabledMapConfigsWithoutHardStop = mapConfigs
    .filter((config) => config.isEnabled && (!config.hardStopEnabled || config.monthlyMapLoadLimit <= 0))
    .map((config) => config.provider);

  const siteSummaries = sites.map((site) => {
    const adminCount = site.memberships.filter((membership) => membership.role === "admin").length;
    const staffCount = site.memberships.filter((membership) => membership.role === "staff").length;

    return {
      id: site.id,
      name: site.name,
      queues: {
        total: site.queues.length,
        open: site.queues.filter((queue) => queue.isOpen).length,
        closed: site.queues.filter((queue) => !queue.isOpen).length,
        items: site.queues.map((queue) => ({
          id: queue.id,
          name: queue.name,
          isOpen: queue.isOpen,
        })),
      },
      staffAccess: {
        admins: adminCount,
        staff: staffCount,
      },
      setup: {
        hasAddress: Boolean(site.addressLine1 || site.city || site.region || site.country),
        hasCoordinates: typeof site.latitude === "number" && typeof site.longitude === "number",
        notificationAheadCount: site.notificationAheadCount,
      },
      tickets: completeStatusCounts(ticketCountsBySite.get(site.id)),
    };
  });

  const checks: AdminDataCheck[] = [
    check("organizations_present", organizationCount > 0, "ready", "no_organizations_found", organizationCount),
    check("sites_present", sites.length > 0, "ready", "no_sites_found", sites.length),
    check(
      "expected_sites_present",
      missingExpectedSiteIds.length === 0,
      expectedSiteIds.length > 0 ? "ready" : "not_requested",
      "expected_sites_missing",
      missingExpectedSiteIds.length,
    ),
    check("site_queues", sitesWithoutQueues.length === 0, "ready", "sites_without_queues", sitesWithoutQueues.length),
    check("site_admins", sitesWithoutAdmins.length === 0, "ready", "sites_without_admins", sitesWithoutAdmins.length),
    check(
      "expected_staff_admins",
      sitesMissingExpectedStaffAdmins.length === 0,
      expectedStaffAdminEmails.length > 0 ? "ready" : "not_requested",
      "expected_staff_admins_missing",
      sitesMissingExpectedStaffAdmins.length,
    ),
    check(
      "notification_thresholds",
      sitesWithInvalidNotificationThreshold.length === 0,
      "ready",
      "invalid_notification_thresholds",
      sitesWithInvalidNotificationThreshold.length,
    ),
    check("map_provider_configs", mapConfigs.length > 0, "ready", "no_map_provider_configs_found", mapConfigs.length),
    check(
      "map_guardrails",
      enabledMapConfigsWithoutHardStop.length === 0,
      "ready",
      "enabled_map_provider_without_hard_stop_or_limit",
      enabledMapConfigsWithoutHardStop.length,
    ),
  ];

  const payload = {
    ok: checks.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    checks,
    expectations: {
      siteIds: expectedSiteIds,
      missingSiteIds: missingExpectedSiteIds,
      staffAdminEmails: expectedStaffAdminEmails.length,
      sitesMissingExpectedStaffAdmins,
    },
    summary: {
      organizations: organizationCount,
      sites: sites.length,
      queues: sites.reduce((total, site) => total + site.queues.length, 0),
      memberships: {
        admins: sites.reduce((total, site) => total + site.memberships.filter((membership) => membership.role === "admin").length, 0),
        staff: sites.reduce((total, site) => total + site.memberships.filter((membership) => membership.role === "staff").length, 0),
      },
      auditLogs: auditLogCount,
    },
    sites: siteSummaries,
    maps: mapConfigs.map((config) => ({
      provider: config.provider,
      isEnabled: config.isEnabled,
      monthlyMapLoadLimit: config.monthlyMapLoadLimit,
      hardStopEnabled: config.hardStopEnabled,
    })),
  };

  console.log(JSON.stringify(payload, null, 2));

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch(() => {
    console.error(
      JSON.stringify({
        ok: false,
        error: "admin_data_verification_failed",
        status: "database_or_query_failed",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
