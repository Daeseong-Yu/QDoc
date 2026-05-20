import type { IncomingMessage, ServerResponse } from "node:http";
import {
  mapConfigResponseSchema,
  mapProviderSchema,
  mapUsageInputSchema,
  mapUsageResponseSchema,
  type MapProvider,
} from "@qdoc/contracts";
import { prisma } from "@qdoc/db";
import { getRequesterKey } from "./auth.js";
import { readJson, sendJson } from "./http.js";
import { logOperationalEvent } from "./ops-log.js";
import { checkMapUsageRateLimit } from "./rate-limit.js";

type MapAvailability = {
  provider: MapProvider | null;
  isEnabled: boolean;
  publicToken: string | null;
  limit: number;
  used: number;
  periodStart: Date;
  resetAt: Date;
  reason: "provider_disabled" | "token_missing" | "budget_exhausted" | "available";
};

type MapOperationalStatus = {
  provider: MapProvider | null;
  ok: boolean;
  isEnabled: boolean;
  reason: MapAvailability["reason"];
  remainingMapLoads: number;
  resetAt: string;
};

function getConfiguredProvider() {
  const parsed = mapProviderSchema.safeParse(process.env.MAP_PROVIDER?.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

function getPublicToken(provider: MapProvider) {
  if (provider === "mapbox") {
    return process.env.MAPBOX_PUBLIC_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null;
  }

  return process.env.GOOGLE_MAPS_BROWSER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
}

function getEnvLimit() {
  const limit = Number.parseInt(process.env.MAP_MONTHLY_MAP_LOAD_LIMIT ?? "", 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function getPeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getResetAt(periodStart: Date) {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
}

async function getMapAvailability(): Promise<MapAvailability> {
  const provider = getConfiguredProvider();
  const periodStart = getPeriodStart();
  const resetAt = getResetAt(periodStart);

  if (!provider) {
    return {
      provider: null,
      isEnabled: false,
      publicToken: null,
      limit: 0,
      used: 0,
      periodStart,
      resetAt,
      reason: "provider_disabled",
    };
  }

  const [config, usagePeriod] = await Promise.all([
    prisma.mapProviderConfig.findUnique({
      where: { provider },
      select: {
        isEnabled: true,
        hardStopEnabled: true,
        monthlyMapLoadLimit: true,
      },
    }),
    prisma.mapUsagePeriod.findUnique({
      where: {
        provider_usageType_periodStart: {
          provider,
          usageType: "map_load",
          periodStart,
        },
      },
      select: {
        used: true,
      },
    }),
  ]);

  const publicToken = getPublicToken(provider);
  const limit = config ? config.monthlyMapLoadLimit : getEnvLimit();
  const isEnabled = config
    ? config.isEnabled && config.hardStopEnabled
    : process.env.MAP_PROVIDER_ENABLED === "true";
  const used = usagePeriod?.used ?? 0;

  if (!isEnabled) {
    return { provider, isEnabled: false, publicToken, limit, used, periodStart, resetAt, reason: "provider_disabled" };
  }

  if (!publicToken) {
    return { provider, isEnabled: true, publicToken: null, limit, used, periodStart, resetAt, reason: "token_missing" };
  }

  if (limit <= 0 || used >= limit) {
    return { provider, isEnabled: true, publicToken, limit, used, periodStart, resetAt, reason: "budget_exhausted" };
  }

  return { provider, isEnabled: true, publicToken, limit, used, periodStart, resetAt, reason: "available" };
}

function getRemainingMapLoads(availability: Pick<MapAvailability, "limit" | "used">) {
  return Math.max(availability.limit - availability.used, 0);
}

function logMapHardStop(availability: MapAvailability, usageType: string, reason: MapAvailability["reason"]) {
  logOperationalEvent("warn", "qdoc.map_usage_hard_stop", {
    provider: availability.provider,
    usageType,
    reason,
    remainingMapLoads: getRemainingMapLoads(availability),
    resetAt: availability.resetAt.toISOString(),
  });
}

export async function getMapOperationalStatus(): Promise<MapOperationalStatus> {
  const availability = await getMapAvailability();

  return {
    provider: availability.provider,
    ok: availability.reason === "available" || availability.reason === "provider_disabled",
    isEnabled: availability.isEnabled,
    reason: availability.reason,
    remainingMapLoads: getRemainingMapLoads(availability),
    resetAt: availability.resetAt.toISOString(),
  };
}

export async function handleMapConfig(_request: IncomingMessage, response: ServerResponse) {
  const availability = await getMapAvailability();

  sendJson(
    response,
    200,
    mapConfigResponseSchema.parse({
      provider: availability.provider,
      isEnabled: availability.isEnabled,
      canLoad: availability.reason === "available",
      publicToken: null,
      remainingMapLoads: getRemainingMapLoads(availability),
      resetAt: availability.resetAt.toISOString(),
      reason: availability.reason,
    }),
  );
}

export async function handleMapUsage(request: IncomingMessage, response: ServerResponse) {
  const input = mapUsageInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const rateLimit = await checkMapUsageRateLimit(getRequesterKey(request));

  if (!rateLimit.allowed) {
    sendJson(response, 429, { error: "rate_limited" }, { "retry-after": String(rateLimit.retryAfterSeconds) });
    return;
  }

  const availability = await getMapAvailability();

  if (!availability.provider || !availability.isEnabled) {
    logMapHardStop(availability, input.data.usageType, "provider_disabled");
    sendJson(response, 409, { error: "map_provider_disabled" });
    return;
  }

  if (availability.reason !== "available") {
    logMapHardStop(availability, input.data.usageType, availability.reason);
    sendJson(response, 409, { error: availability.reason === "token_missing" ? "map_provider_disabled" : "map_budget_exhausted" });
    return;
  }

  const usagePeriod = await prisma.$transaction(async (tx) => {
    const period = await tx.mapUsagePeriod.upsert({
      where: {
        provider_usageType_periodStart: {
          provider: availability.provider!,
          usageType: input.data.usageType,
          periodStart: availability.periodStart,
        },
      },
      update: {
        limit: availability.limit,
      },
      create: {
        provider: availability.provider!,
        usageType: input.data.usageType,
        periodStart: availability.periodStart,
        limit: availability.limit,
      },
      select: {
        id: true,
        limit: true,
      },
    });

    const reserved = await tx.mapUsagePeriod.updateMany({
      where: {
        id: period.id,
        used: {
          lt: period.limit,
        },
      },
      data: {
        used: {
          increment: 1,
        },
      },
    });

    if (reserved.count !== 1) {
      await tx.mapUsagePeriod.update({
        where: { id: period.id },
        data: {
          hardStoppedAt: new Date(),
        },
      });
      return null;
    }

    return tx.mapUsagePeriod.findUniqueOrThrow({
      where: { id: period.id },
      select: {
        provider: true,
        usageType: true,
        limit: true,
        used: true,
      },
    });
  });

  if (!usagePeriod) {
    logMapHardStop(availability, input.data.usageType, "budget_exhausted");
    sendJson(response, 409, { error: "map_budget_exhausted" });
    return;
  }

  sendJson(
    response,
    200,
    mapUsageResponseSchema.parse({
      provider: usagePeriod.provider,
      usageType: usagePeriod.usageType,
      accepted: true,
      publicToken: availability.publicToken,
      remainingMapLoads: getRemainingMapLoads(usagePeriod),
      resetAt: availability.resetAt.toISOString(),
    }),
  );
}
