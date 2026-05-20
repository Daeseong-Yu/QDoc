import { prisma } from "@qdoc/db";

type OpsCheck = {
  name: string;
  ok: boolean;
  value: number | string | boolean;
  status: string;
};

const ticketStatuses = ["waiting", "called", "in_service", "completed", "delay", "cancelled"];

function getPeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getConfiguredNumber(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function countRows(rows: Array<{ status: string; _count: { _all: number } }>) {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Record<string, number>;
}

async function main() {
  const now = new Date();
  const processingTimeoutMs = getConfiguredNumber("WORKER_OUTBOX_PROCESSING_TIMEOUT_MS", 60_000);
  const periodStart = getPeriodStart(now);
  const staleProcessingCutoff = new Date(now.getTime() - processingTimeoutMs);

  const [
    outboxStatusRows,
    oldestPending,
    staleProcessingCount,
    failedNotificationJobs,
    ticketStatusRows,
    mapConfigs,
    mapUsagePeriods,
  ] = await Promise.all([
    prisma.outbox.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.outbox.findFirst({
      where: {
        status: "pending",
        availableAt: {
          lte: now,
        },
      },
      orderBy: {
        availableAt: "asc",
      },
      select: {
        availableAt: true,
      },
    }),
    prisma.outbox.count({
      where: {
        status: "processing",
        updatedAt: {
          lte: staleProcessingCutoff,
        },
      },
    }),
    prisma.outbox.count({
      where: {
        type: "ticket.almost_ready_email",
        status: "failed",
      },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
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
    prisma.mapUsagePeriod.findMany({
      where: {
        usageType: "map_load",
        periodStart,
      },
      select: {
        provider: true,
        limit: true,
        used: true,
        hardStoppedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const outboxByStatus = countRows(outboxStatusRows);
  const ticketByStatus = countRows(
    ticketStatusRows.map((row) => ({
      status: row.status,
      _count: row._count,
    })),
  );
  const pendingAgeSeconds = oldestPending ? Math.max(0, Math.floor((now.getTime() - oldestPending.availableAt.getTime()) / 1000)) : 0;
  const failedOutboxCount = outboxByStatus.failed ?? 0;
  const maps = mapConfigs.map((config) => {
    const usage = mapUsagePeriods.find((period) => period.provider === config.provider);
    const limit = usage?.limit ?? config.monthlyMapLoadLimit;
    const used = usage?.used ?? 0;
    const remainingMapLoads = Math.max(limit - used, 0);
    const reason = !config.isEnabled
      ? "provider_disabled"
      : !config.hardStopEnabled
        ? "hard_stop_disabled"
        : limit <= 0
          ? "limit_missing"
          : remainingMapLoads <= 0
            ? "budget_exhausted"
            : "available";

    return {
      provider: config.provider,
      ok: reason === "provider_disabled" || reason === "available",
      isEnabled: config.isEnabled,
      hardStopEnabled: config.hardStopEnabled,
      limit,
      used,
      remainingMapLoads,
      hardStoppedAt: usage?.hardStoppedAt?.toISOString() ?? null,
      reason,
    };
  });

  const checks: OpsCheck[] = [
    {
      name: "outbox_failed_jobs",
      ok: failedOutboxCount === 0,
      value: failedOutboxCount,
      status: failedOutboxCount === 0 ? "ready" : "failed_jobs_present",
    },
    {
      name: "outbox_stale_processing_jobs",
      ok: staleProcessingCount === 0,
      value: staleProcessingCount,
      status: staleProcessingCount === 0 ? "ready" : "stale_processing_jobs_present",
    },
    {
      name: "notification_failed_email_jobs",
      ok: failedNotificationJobs === 0,
      value: failedNotificationJobs,
      status: failedNotificationJobs === 0 ? "ready" : "failed_email_jobs_present",
    },
    {
      name: "map_guardrails",
      ok: maps.every((map) => map.ok),
      value: maps.length,
      status: maps.every((map) => map.ok) ? "ready" : "map_guardrail_attention_required",
    },
  ];

  const payload = {
    ok: checks.every((check) => check.ok),
    generatedAt: now.toISOString(),
    checks,
    outbox: {
      byStatus: outboxByStatus,
      pendingAgeSeconds,
    },
    notifications: {
      failedAlmostReadyEmailJobs: failedNotificationJobs,
    },
    queues: {
      activeTickets: Object.fromEntries(ticketStatuses.map((status) => [status, ticketByStatus[status] ?? 0])),
    },
    maps,
  };

  console.log(JSON.stringify(payload, null, 2));

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
