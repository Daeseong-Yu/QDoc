import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  mapConfigResponseSchema,
  mapProviderSchema,
  mapUsageInputSchema,
  mapUsageResponseSchema,
  nearbyHealthcareInputSchema,
  nearbyHealthcarePlaceSchema,
  nearbyHealthcareResponseSchema,
  type MapProvider,
  type MapUsageType,
  type NearbyHealthcarePlace,
} from "@qdoc/contracts";
import { prisma } from "@qdoc/db";
import { getRequesterKey } from "./auth.js";
import { readJson, sendJson } from "./http.js";
import { logOperationalEvent } from "./ops-log.js";
import { checkMapSearchRateLimit, checkMapUsageRateLimit } from "./rate-limit.js";

type MapAvailabilityReason = "provider_disabled" | "token_missing" | "budget_exhausted" | "available";

type MapAvailability = {
  provider: MapProvider | null;
  usageType: MapUsageType;
  isEnabled: boolean;
  publicToken: string | null;
  serverToken: string | null;
  limit: number;
  used: number;
  periodStart: Date;
  resetAt: Date;
  reason: MapAvailabilityReason;
};

type MapOperationalStatus = {
  provider: MapProvider | null;
  ok: boolean;
  isEnabled: boolean;
  reason: MapAvailabilityReason;
  remainingMapLoads: number;
  resetAt: string;
};

let lastSearchCacheCleanupAt = 0;

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

function getServerSearchToken(provider: MapProvider) {
  if (provider === "mapbox") {
    return process.env.MAPBOX_SEARCH_TOKEN ?? process.env.MAPBOX_SERVER_TOKEN ?? null;
  }

  return process.env.GOOGLE_PLACES_SERVER_KEY ?? process.env.GOOGLE_MAPS_SERVER_KEY ?? null;
}

function getPositiveIntegerEnv(name: string) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getEnvLimit(usageType: MapUsageType) {
  if (usageType === "places_search") {
    return getPositiveIntegerEnv("MAP_MONTHLY_PLACES_SEARCH_LIMIT");
  }

  return getPositiveIntegerEnv("MAP_MONTHLY_MAP_LOAD_LIMIT");
}

function getPeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getResetAt(periodStart: Date) {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
}

function getRequiredToken(provider: MapProvider, usageType: MapUsageType) {
  return usageType === "places_search" ? getServerSearchToken(provider) : getPublicToken(provider);
}

async function getMapAvailability(usageType: MapUsageType): Promise<MapAvailability> {
  const provider = getConfiguredProvider();
  const periodStart = getPeriodStart();
  const resetAt = getResetAt(periodStart);

  if (!provider) {
    return {
      provider: null,
      usageType,
      isEnabled: false,
      publicToken: null,
      serverToken: null,
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
        monthlyPlacesSearchLimit: true,
      },
    }),
    prisma.mapUsagePeriod.findUnique({
      where: {
        provider_usageType_periodStart: {
          provider,
          usageType,
          periodStart,
        },
      },
      select: { used: true },
    }),
  ]);

  const publicToken = getPublicToken(provider);
  const serverToken = getServerSearchToken(provider);
  const requiredToken = getRequiredToken(provider, usageType);
  const limit = config
    ? usageType === "places_search"
      ? config.monthlyPlacesSearchLimit
      : config.monthlyMapLoadLimit
    : getEnvLimit(usageType);
  const isEnabled = config ? config.isEnabled && config.hardStopEnabled : process.env.MAP_PROVIDER_ENABLED === "true";
  const used = usagePeriod?.used ?? 0;

  if (!isEnabled) {
    return {
      provider,
      usageType,
      isEnabled: false,
      publicToken,
      serverToken,
      limit,
      used,
      periodStart,
      resetAt,
      reason: "provider_disabled",
    };
  }

  if (!requiredToken) {
    return {
      provider,
      usageType,
      isEnabled: true,
      publicToken,
      serverToken,
      limit,
      used,
      periodStart,
      resetAt,
      reason: "token_missing",
    };
  }

  if (limit <= 0 || used >= limit) {
    return {
      provider,
      usageType,
      isEnabled: true,
      publicToken,
      serverToken,
      limit,
      used,
      periodStart,
      resetAt,
      reason: "budget_exhausted",
    };
  }

  return {
    provider,
    usageType,
    isEnabled: true,
    publicToken,
    serverToken,
    limit,
    used,
    periodStart,
    resetAt,
    reason: "available",
  };
}

function getRemaining(availability: Pick<MapAvailability, "limit" | "used">) {
  return Math.max(availability.limit - availability.used, 0);
}

function logMapHardStop(availability: MapAvailability, reason: MapAvailabilityReason) {
  logOperationalEvent("warn", "qdoc.map_usage_hard_stop", {
    provider: availability.provider,
    usageType: availability.usageType,
    reason,
    remaining: getRemaining(availability),
    resetAt: availability.resetAt.toISOString(),
  });
}

async function reserveUsage(availability: MapAvailability) {
  if (!availability.provider) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const period = await tx.mapUsagePeriod.upsert({
      where: {
        provider_usageType_periodStart: {
          provider: availability.provider!,
          usageType: availability.usageType,
          periodStart: availability.periodStart,
        },
      },
      update: { limit: availability.limit },
      create: {
        provider: availability.provider!,
        usageType: availability.usageType,
        periodStart: availability.periodStart,
        limit: availability.limit,
      },
      select: { id: true, limit: true },
    });

    const reserved = await tx.mapUsagePeriod.updateMany({
      where: {
        id: period.id,
        used: { lt: period.limit },
      },
      data: {
        used: { increment: 1 },
      },
    });

    if (reserved.count !== 1) {
      await tx.mapUsagePeriod.update({
        where: { id: period.id },
        data: { hardStoppedAt: new Date() },
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
}

export async function getMapOperationalStatus(): Promise<MapOperationalStatus> {
  const availability = await getMapAvailability("map_load");
  return {
    provider: availability.provider,
    ok: availability.reason === "available" || availability.reason === "provider_disabled",
    isEnabled: availability.isEnabled,
    reason: availability.reason,
    remainingMapLoads: getRemaining(availability),
    resetAt: availability.resetAt.toISOString(),
  };
}

export async function handleMapConfig(_request: IncomingMessage, response: ServerResponse) {
  const availability = await getMapAvailability("map_load");

  sendJson(
    response,
    200,
    mapConfigResponseSchema.parse({
      provider: availability.provider,
      isEnabled: availability.isEnabled,
      canLoad: availability.reason === "available",
      publicToken: null,
      remainingMapLoads: getRemaining(availability),
      resetAt: availability.resetAt.toISOString(),
      reason: availability.reason,
    }),
  );
}

export async function handleMapUsage(request: IncomingMessage, response: ServerResponse) {
  const input = mapUsageInputSchema.safeParse(await readJson(request));

  if (!input.success || input.data.usageType !== "map_load") {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const rateLimit = await checkMapUsageRateLimit(getRequesterKey(request));

  if (!rateLimit.allowed) {
    sendJson(response, 429, { error: "rate_limited" }, { "retry-after": String(rateLimit.retryAfterSeconds) });
    return;
  }

  const availability = await getMapAvailability("map_load");

  if (!availability.provider || !availability.isEnabled) {
    logMapHardStop(availability, "provider_disabled");
    sendJson(response, 409, { error: "map_provider_disabled" });
    return;
  }

  if (availability.reason !== "available") {
    logMapHardStop(availability, availability.reason);
    sendJson(response, 409, {
      error: availability.reason === "token_missing" ? "map_provider_disabled" : "map_budget_exhausted",
    });
    return;
  }

  const usagePeriod = await reserveUsage(availability);

  if (!usagePeriod) {
    logMapHardStop(availability, "budget_exhausted");
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
      publicToken: availability.publicToken ?? "",
      remainingMapLoads: getRemaining(usagePeriod),
      resetAt: availability.resetAt.toISOString(),
    }),
  );
}

function getSearchCacheTtlSeconds() {
  const value = Number.parseInt(process.env.MAP_SEARCH_CACHE_TTL_SECONDS ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return 600;
  }

  return Math.min(value, 3600);
}

function getSearchBucket(latitude: number, longitude: number, radiusMeters: number) {
  return {
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100,
    radiusMeters: Math.max(500, Math.min(10_000, Math.round(radiusMeters / 500) * 500)),
  };
}

function getSearchQueryKey(provider: MapProvider, latitude: number, longitude: number, radiusMeters: number) {
  const bucket = getSearchBucket(latitude, longitude, radiusMeters);
  return createHash("sha256")
    .update(`${provider}:${bucket.latitude.toFixed(2)}:${bucket.longitude.toFixed(2)}:${bucket.radiusMeters}`)
    .digest("hex");
}

async function getCachedPlaces(provider: MapProvider, queryKey: string) {
  await pruneExpiredSearchCache();

  const cached = await prisma.mapSearchCache.findUnique({
    where: { provider_queryKey: { provider, queryKey } },
    select: { responseJson: true, expiresAt: true },
  });

  if (!cached || cached.expiresAt <= new Date()) {
    return null;
  }

  const parsed = nearbyHealthcarePlaceSchema.array().safeParse(cached.responseJson);
  return parsed.success ? parsed.data : null;
}

async function pruneExpiredSearchCache() {
  const now = Date.now();

  if (now - lastSearchCacheCleanupAt < 5 * 60 * 1000) {
    return;
  }

  lastSearchCacheCleanupAt = now;

  try {
    await prisma.mapSearchCache.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
  } catch (error) {
    logOperationalEvent("warn", "qdoc.map_search_cache_cleanup_failed", {
      error: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
  }
}

async function saveCachedPlaces(provider: MapProvider, queryKey: string, places: NearbyHealthcarePlace[]) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getSearchCacheTtlSeconds() * 1000);

  await prisma.mapSearchCache.upsert({
    where: { provider_queryKey: { provider, queryKey } },
    update: {
      responseJson: places,
      expiresAt,
    },
    create: {
      provider,
      queryKey,
      responseJson: places,
      expiresAt,
    },
  });
}

function getFiniteCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePlace(
  provider: MapProvider,
  raw: {
    providerPlaceId: unknown;
    name: unknown;
    address: unknown;
    latitude: unknown;
    longitude: unknown;
  },
): NearbyHealthcarePlace | null {
  const providerPlaceId =
    typeof raw.providerPlaceId === "string" && raw.providerPlaceId.trim() ? raw.providerPlaceId.trim() : null;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  const latitude = getFiniteCoordinate(raw.latitude);
  const longitude = getFiniteCoordinate(raw.longitude);

  if (!providerPlaceId || !name || latitude === null || longitude === null) {
    return null;
  }

  return nearbyHealthcarePlaceSchema.parse({
    id: `${provider}:${providerPlaceId}`,
    providerPlaceId,
    name: name.slice(0, 160),
    address: typeof raw.address === "string" && raw.address.trim() ? raw.address.trim().slice(0, 240) : null,
    latitude,
    longitude,
    qdocSiteId: null,
  });
}

async function fetchGoogleHealthcarePlaces(token: string, latitude: number, longitude: number, radiusMeters: number) {
  const providerResponse = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": token,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      includedTypes: ["hospital", "doctor", "dentist", "pharmacy"],
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      },
      maxResultCount: 10,
      rankPreference: "DISTANCE",
    }),
  });

  if (!providerResponse.ok) {
    throw new Error(`google_places_search_failed:${providerResponse.status}`);
  }

  const data = (await providerResponse.json()) as { places?: Array<Record<string, unknown>> };

  return (data.places ?? [])
    .map((place) => {
      const displayName = place.displayName as { text?: unknown } | undefined;
      const location = place.location as { latitude?: unknown; longitude?: unknown } | undefined;
      return normalizePlace("google", {
        providerPlaceId: place.id,
        name: displayName?.text,
        address: place.formattedAddress,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
    })
    .filter((place): place is NearbyHealthcarePlace => place !== null);
}

function getApproximateBbox(latitude: number, longitude: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.2));
  return [longitude - lngDelta, latitude - latDelta, longitude + lngDelta, latitude + latDelta].map((value) =>
    Number(value.toFixed(6)),
  );
}

async function fetchMapboxHealthcarePlaces(token: string, latitude: number, longitude: number, radiusMeters: number) {
  const params = new URLSearchParams({
    q: "hospital clinic doctor",
    proximity: `${longitude},${latitude}`,
    bbox: getApproximateBbox(latitude, longitude, radiusMeters).join(","),
    types: "poi",
    limit: "10",
    access_token: token,
  });
  const providerResponse = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`);

  if (!providerResponse.ok) {
    throw new Error(`mapbox_search_failed:${providerResponse.status}`);
  }

  const data = (await providerResponse.json()) as { features?: Array<Record<string, unknown>> };

  return (data.features ?? [])
    .map((feature) => {
      const properties = feature.properties as Record<string, unknown> | undefined;
      const geometry = feature.geometry as { coordinates?: unknown } | undefined;
      const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
      return normalizePlace("mapbox", {
        providerPlaceId: properties?.mapbox_id ?? feature.id,
        name: properties?.name,
        address: properties?.full_address ?? properties?.place_formatted,
        latitude: coordinates[1],
        longitude: coordinates[0],
      });
    })
    .filter((place): place is NearbyHealthcarePlace => place !== null);
}

async function fetchProviderHealthcarePlaces(
  provider: MapProvider,
  token: string,
  latitude: number,
  longitude: number,
  radiusMeters: number,
) {
  if (provider === "mapbox") {
    return fetchMapboxHealthcarePlaces(token, latitude, longitude, radiusMeters);
  }

  return fetchGoogleHealthcarePlaces(token, latitude, longitude, radiusMeters);
}

export async function handleNearbyHealthcare(request: IncomingMessage, response: ServerResponse) {
  const input = nearbyHealthcareInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const rateLimit = await checkMapSearchRateLimit(getRequesterKey(request));

  if (!rateLimit.allowed) {
    sendJson(response, 429, { error: "rate_limited" }, { "retry-after": String(rateLimit.retryAfterSeconds) });
    return;
  }

  const availability = await getMapAvailability("places_search");
  const responseBase = {
    provider: availability.provider,
    radiusMeters: input.data.radiusMeters,
  };

  if (!availability.provider || !availability.isEnabled) {
    logMapHardStop(availability, "provider_disabled");
    sendJson(response, 200, nearbyHealthcareResponseSchema.parse({ ...responseBase, places: [], source: "unavailable" }));
    return;
  }

  const queryKey = getSearchQueryKey(
    availability.provider,
    input.data.latitude,
    input.data.longitude,
    input.data.radiusMeters,
  );
  const cachedPlaces = await getCachedPlaces(availability.provider, queryKey);

  if (cachedPlaces) {
    sendJson(response, 200, nearbyHealthcareResponseSchema.parse({ ...responseBase, places: cachedPlaces, source: "cache" }));
    return;
  }

  if (availability.reason !== "available" || !availability.serverToken) {
    logMapHardStop(availability, availability.reason);
    sendJson(response, 200, nearbyHealthcareResponseSchema.parse({ ...responseBase, places: [], source: "unavailable" }));
    return;
  }

  const usagePeriod = await reserveUsage(availability);

  if (!usagePeriod) {
    logMapHardStop(availability, "budget_exhausted");
    sendJson(response, 200, nearbyHealthcareResponseSchema.parse({ ...responseBase, places: [], source: "unavailable" }));
    return;
  }

  try {
    const places = await fetchProviderHealthcarePlaces(
      availability.provider,
      availability.serverToken,
      input.data.latitude,
      input.data.longitude,
      input.data.radiusMeters,
    );

    await saveCachedPlaces(availability.provider, queryKey, places);
    sendJson(response, 200, nearbyHealthcareResponseSchema.parse({ ...responseBase, places, source: "provider" }));
  } catch (error) {
    logOperationalEvent("error", "qdoc.nearby_healthcare_search_failed", {
      provider: availability.provider,
      usageType: availability.usageType,
      error: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    sendJson(response, 200, nearbyHealthcareResponseSchema.parse({ ...responseBase, places: [], source: "unavailable" }));
  }
}
