import type { ServerResponse } from "node:http";
import { prisma } from "@qdoc/db";
import { getEmailDeliveryHealth } from "./email.js";
import { sendJson } from "./http.js";
import { getMapOperationalStatus } from "./maps.js";
import { checkRedisHealth } from "./rate-limit.js";

type ReadinessCheck = {
  name: string;
  ok: boolean;
  status: string;
  details?: Record<string, string | number | boolean | null>;
};

function getErrorStatus(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 120) : "unknown_error";
}

async function checkDatabase(): Promise<ReadinessCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "database", ok: true, status: "ready" };
  } catch (error) {
    return { name: "database", ok: false, status: getErrorStatus(error) };
  }
}

async function checkRedis(): Promise<ReadinessCheck> {
  const redis = await checkRedisHealth();

  return {
    name: "redis",
    ok: redis.ok,
    status: redis.status,
    details: {
      configured: redis.configured,
    },
  };
}

function checkEmailDelivery(): ReadinessCheck {
  const emailDelivery = getEmailDeliveryHealth();

  return {
    name: "email_delivery",
    ok: emailDelivery.ok,
    status: emailDelivery.ok ? "ready" : "unavailable",
    details: {
      provider: emailDelivery.provider,
    },
  };
}

async function checkMaps(): Promise<ReadinessCheck> {
  try {
    const maps = await getMapOperationalStatus();

    return {
      name: "maps",
      ok: maps.ok,
      status: maps.reason,
      details: {
        provider: maps.provider,
        isEnabled: maps.isEnabled,
        remainingMapLoads: maps.remainingMapLoads,
        resetAt: maps.resetAt,
      },
    };
  } catch (error) {
    return { name: "maps", ok: false, status: getErrorStatus(error) };
  }
}

export async function handleReadiness(response: ServerResponse) {
  const checks = await Promise.all([checkDatabase(), checkRedis(), Promise.resolve(checkEmailDelivery()), checkMaps()]);
  const ok = checks.every((check) => check.ok);

  sendJson(response, ok ? 200 : 503, {
    ok,
    service: "api",
    generatedAt: new Date().toISOString(),
    checks,
  });
}
