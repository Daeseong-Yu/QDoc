import type { IncomingMessage, ServerResponse } from "node:http";
import {
  activeTicketStatuses,
  mapProviderSchema,
  staffAuditLogSummarySchema,
  staffMapSettingsInputSchema,
  staffMapSettingsResponseSchema,
  staffMembershipInputSchema,
  staffMembershipRoleInputSchema,
  staffMembershipSummarySchema,
  staffNotificationHealthSchema,
  staffQueueResponseSchema,
  staffQueueSettingsInputSchema,
  staffQueueSummarySchema,
  staffSiteOpsResponseSchema,
  staffSiteSettingsInputSchema,
  staffSiteSettingsSchema,
  staffTicketActionInputSchema,
  staffTicketResponseSchema,
  type MapProvider,
  type MembershipRole,
  type TicketStatus,
} from "@qdoc/contracts";
import { prisma } from "@qdoc/db";
import { readJson, sendJson } from "./http.js";
import { getCurrentUserFromRequest, requireStaffMembership } from "./auth.js";
import { logOperationalEvent, maskIdentifier } from "./ops-log.js";
import { streamSnapshots } from "./sse.js";

type StaffTicketAction = "call" | "start-service" | "complete" | "delay" | "restore" | "cancel";

type StaffTicketRecord = {
  id: string;
  siteId: string;
  queueId: string;
  userId: string;
  status: TicketStatus;
  updatedAt: Date;
  site: {
    name: string;
  };
  queue: {
    name: string;
  };
  user: {
    email: string;
  };
};

type StaffQueueTicketRecord = Omit<StaffTicketRecord, "user"> & {
  createdAt: Date;
  user: {
    email: string;
  };
};

const ticketTransitionByAction: Record<StaffTicketAction, { from: TicketStatus[]; to: TicketStatus; auditAction: string }> = {
  call: {
    from: ["waiting"],
    to: "called",
    auditAction: "ticket.call",
  },
  "start-service": {
    from: ["called"],
    to: "in_service",
    auditAction: "ticket.start_service",
  },
  complete: {
    from: ["in_service"],
    to: "completed",
    auditAction: "ticket.complete",
  },
  delay: {
    from: ["called"],
    to: "delay",
    auditAction: "ticket.delay",
  },
  restore: {
    from: ["delay"],
    to: "waiting",
    auditAction: "ticket.restore",
  },
  cancel: {
    from: ["waiting", "called", "delay"],
    to: "cancelled",
    auditAction: "ticket.cancel",
  },
};

const ticketStatusLabels: Record<TicketStatus, string> = {
  waiting: "waiting",
  called: "called",
  in_service: "in service",
  completed: "completed",
  delay: "delayed",
  cancelled: "cancelled",
};

const almostReadyMessage = "Your turn is coming up. Please stay nearby.";
const notificationOutboxTypes = ["ticket.status_changed", "ticket.almost_ready_email"];

function maskEmail(email: string) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0) {
    return "masked";
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (localPart.length <= 1) {
    return `*@${domain}`;
  }

  const visiblePrefix = localPart.length === 2 ? localPart.slice(0, 1) : localPart.slice(0, 2);
  const maskedPart = "*".repeat(localPart.length - visiblePrefix.length);

  return `${visiblePrefix}${maskedPart}@${domain}`;
}

function getTicketStatusMessage(status: TicketStatus) {
  if (status === "called") {
    return "Your queue ticket has been called.";
  }

  return `Your queue ticket is now ${ticketStatusLabels[status]}.`;
}

function serializeStaffTicket(ticket: StaffTicketRecord) {
  return {
    id: ticket.id,
    siteId: ticket.siteId,
    siteName: ticket.site.name,
    queueId: ticket.queueId,
    queueName: ticket.queue.name,
    patientEmail: maskEmail(ticket.user.email),
    status: ticket.status,
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function serializeStaffQueueTicket(ticket: StaffQueueTicketRecord) {
  return {
    id: ticket.id,
    siteId: ticket.siteId,
    siteName: ticket.site.name,
    queueId: ticket.queueId,
    queueName: ticket.queue.name,
    patientEmail: maskEmail(ticket.user.email),
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

async function getStaffQueuePayload(siteId: string) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      name: true,
      queues: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          name: true,
          isOpen: true,
        },
      },
      tickets: {
        where: {
          status: {
            in: activeTicketStatuses,
          },
        },
        orderBy: [
          {
            queue: {
              createdAt: "asc",
            },
          },
          {
            sortRank: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
        include: {
          site: {
            select: {
              name: true,
            },
          },
          queue: {
            select: {
              name: true,
            },
          },
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  if (!site) {
    return null;
  }

  return staffQueueResponseSchema.parse({
    siteId: site.id,
    siteName: site.name,
    queues: site.queues,
    tickets: site.tickets.map(serializeStaffQueueTicket),
  });
}

async function authorizeStaffQueue(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await requireStaffMembership(request, siteId);

  if (auth.status === "unauthorized") {
    sendJson(response, 401, { error: "unauthorized" });
    return false;
  }

  if (auth.status === "forbidden") {
    sendJson(response, 403, { error: "forbidden" });
    return false;
  }

  return auth;
}

async function authorizeStaffAdmin(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await authorizeStaffQueue(request, response, siteId);

  if (!auth) {
    return false;
  }

  if (auth.membership.role !== "admin") {
    sendJson(response, 403, { error: "forbidden" });
    return false;
  }

  return auth;
}

function getMapSettingsAdminEmails() {
  return new Set(
    (process.env.MAP_SETTINGS_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isMapSettingsAdmin(currentUser: { email: string }) {
  return getMapSettingsAdminEmails().has(currentUser.email.toLowerCase());
}

async function authorizeMapSettingsAdmin(request: IncomingMessage, response: ServerResponse) {
  const currentUser = await getCurrentUserFromRequest(request);

  if (!currentUser) {
    sendJson(response, 401, { error: "unauthorized" });
    return false;
  }

  if (!isMapSettingsAdmin(currentUser)) {
    sendJson(response, 403, { error: "forbidden" });
    return false;
  }

  return currentUser;
}

function getConfiguredMapProvider() {
  const parsed = mapProviderSchema.safeParse(process.env.MAP_PROVIDER?.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

function getPublicMapToken(provider: MapProvider) {
  if (provider === "mapbox") {
    return process.env.MAPBOX_PUBLIC_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null;
  }

  return process.env.GOOGLE_MAPS_BROWSER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
}

function getEnvMapLimit() {
  const limit = Number.parseInt(process.env.MAP_MONTHLY_MAP_LOAD_LIMIT ?? "", 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function getEnvPlacesSearchLimit() {
  const limit = Number.parseInt(process.env.MAP_MONTHLY_PLACES_SEARCH_LIMIT ?? "", 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function getMapPeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getMapResetAt(periodStart: Date) {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
}

function getRemainingMapLoads(limit: number, used: number) {
  return Math.max(limit - used, 0);
}

async function getStaffMapSettingsPayload(providerOverride?: MapProvider) {
  const provider = providerOverride ?? getConfiguredMapProvider();
  const periodStart = getMapPeriodStart();
  const resetAt = getMapResetAt(periodStart);

  if (!provider) {
    return staffMapSettingsResponseSchema.parse({
      provider: null,
      isConfigured: false,
      isEnabled: false,
      hardStopEnabled: true,
      monthlyMapLoadLimit: 0,
      usedMapLoads: 0,
      remainingMapLoads: 0,
      monthlyPlacesSearchLimit: 0,
      usedPlacesSearches: 0,
      remainingPlacesSearches: 0,
      resetAt: resetAt.toISOString(),
      reason: "provider_disabled",
    });
  }

  const [config, usagePeriods] = await Promise.all([
    prisma.mapProviderConfig.findUnique({
      where: { provider },
      select: {
        isEnabled: true,
        hardStopEnabled: true,
        monthlyMapLoadLimit: true,
        monthlyPlacesSearchLimit: true,
      },
    }),
    prisma.mapUsagePeriod.findMany({
      where: {
        provider,
        usageType: { in: ["map_load", "places_search"] },
        periodStart,
      },
      select: {
        usageType: true,
        used: true,
      },
    }),
  ]);

  const isEnabled = config?.isEnabled ?? process.env.MAP_PROVIDER_ENABLED === "true";
  const hardStopEnabled = config?.hardStopEnabled ?? true;
  const monthlyMapLoadLimit = config?.monthlyMapLoadLimit ?? getEnvMapLimit();
  const monthlyPlacesSearchLimit = config?.monthlyPlacesSearchLimit ?? getEnvPlacesSearchLimit();
  const usedMapLoads = usagePeriods.find((usagePeriod) => usagePeriod.usageType === "map_load")?.used ?? 0;
  const usedPlacesSearches = usagePeriods.find((usagePeriod) => usagePeriod.usageType === "places_search")?.used ?? 0;
  const reason =
    !isEnabled || !hardStopEnabled
      ? "provider_disabled"
      : !getPublicMapToken(provider)
        ? "token_missing"
        : monthlyMapLoadLimit <= 0 || usedMapLoads >= monthlyMapLoadLimit
          ? "budget_exhausted"
          : "available";

  return staffMapSettingsResponseSchema.parse({
    provider,
    isConfigured: Boolean(config),
    isEnabled,
    hardStopEnabled,
    monthlyMapLoadLimit,
    usedMapLoads,
    remainingMapLoads: getRemainingMapLoads(monthlyMapLoadLimit, usedMapLoads),
    monthlyPlacesSearchLimit,
    usedPlacesSearches,
    remainingPlacesSearches: getRemainingMapLoads(monthlyPlacesSearchLimit, usedPlacesSearches),
    resetAt: resetAt.toISOString(),
    reason,
  });
}

function serializeSiteSettings(site: {
  id: string;
  name: string;
  distanceKm: number;
  notificationAheadCount: number;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  return staffSiteSettingsSchema.parse(site);
}

function serializeMembership(membership: {
  id: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
  };
}) {
  return staffMembershipSummarySchema.parse({
    id: membership.id,
    userId: membership.userId,
    email: membership.user.email,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  });
}

function hasAuditSiteId(metadata: unknown, siteId: string) {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && "siteId" in metadata
    ? (metadata as Record<string, unknown>).siteId === siteId
    : false;
}

async function getSiteAuditLogs(siteId: string) {
  const logs = await prisma.auditLog.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
    include: {
      actor: {
        select: {
          email: true,
        },
      },
    },
  });

  return staffAuditLogSummarySchema.array().parse(
    logs
      .filter((log) => hasAuditSiteId(log.metadata, siteId))
      .slice(0, 20)
      .map((log) => ({
        id: log.id,
        action: log.action,
        actorEmail: log.actor?.email ?? null,
        metadata: log.metadata ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
  );
}

async function getSiteNotificationHealth(siteId: string) {
  const notificationOutboxFilter = {
    type: {
      in: notificationOutboxTypes,
    },
    payload: {
      path: ["siteId"],
      equals: siteId,
    },
  };
  const [pendingOutboxCount, processingOutboxCount, failedOutboxCount, recentFailures] = await Promise.all([
    prisma.outbox.count({
      where: {
        ...notificationOutboxFilter,
        status: "pending",
      },
    }),
    prisma.outbox.count({
      where: {
        ...notificationOutboxFilter,
        status: "processing",
      },
    }),
    prisma.outbox.count({
      where: {
        ...notificationOutboxFilter,
        status: "failed",
      },
    }),
    prisma.outbox.findMany({
      where: {
        ...notificationOutboxFilter,
        status: "failed",
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 5,
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        availableAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return staffNotificationHealthSchema.parse({
    pendingOutboxCount,
    processingOutboxCount,
    failedOutboxCount,
    recentFailures: recentFailures.map((failure) => ({
      id: failure.id,
      type: failure.type,
      status: failure.status,
      attempts: failure.attempts,
      availableAt: failure.availableAt.toISOString(),
      updatedAt: failure.updatedAt.toISOString(),
    })),
  });
}

async function getSiteMemberships(siteId: string) {
  const memberships = await prisma.membership.findMany({
    where: { siteId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  return memberships.map(serializeMembership);
}

async function getStaffSiteOpsPayload(siteId: string, role: MembershipRole, currentUser: { email: string }) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      name: true,
      distanceKm: true,
      notificationAheadCount: true,
      addressLine1: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      latitude: true,
      longitude: true,
      queues: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          name: true,
          isOpen: true,
        },
      },
    },
  });

  if (!site) {
    return null;
  }

  const canManageMapSettings = isMapSettingsAdmin(currentUser);
  const notificationHealth = await getSiteNotificationHealth(siteId);
  const [memberships, mapSettings, auditLogs] =
    role === "admin"
      ? await Promise.all([
          getSiteMemberships(siteId),
          canManageMapSettings ? getStaffMapSettingsPayload() : Promise.resolve(null),
          getSiteAuditLogs(siteId),
        ])
      : [[], null, []];

  return staffSiteOpsResponseSchema.parse({
    role,
    canManageMapSettings,
    site: serializeSiteSettings(site),
    queues: site.queues,
    memberships,
    mapSettings,
    notificationHealth,
    auditLogs,
  });
}

async function ensureAnotherSiteAdmin(siteId: string, membershipId: string) {
  const remainingAdmins = await prisma.membership.count({
    where: {
      siteId,
      role: "admin",
      id: {
        not: membershipId,
      },
    },
  });

  return remainingAdmins > 0;
}

export async function handleStaffQueue(request: IncomingMessage, response: ServerResponse, siteId: string) {
  if (!(await authorizeStaffQueue(request, response, siteId))) {
    return;
  }

  const payload = await getStaffQueuePayload(siteId);

  if (!payload) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  sendJson(response, 200, payload);
}

export async function handleStaffQueueEvents(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await authorizeStaffQueue(request, response, siteId);

  if (!auth) {
    return;
  }

  const initialPayload = await getStaffQueuePayload(siteId);

  if (!initialPayload) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  streamSnapshots(request, response, `staff:${auth.currentUser.id}:${siteId}:queue`, () =>
    getStaffQueuePayload(siteId).then((payload) => payload ?? initialPayload),
  );
}

export async function handleStaffSiteOps(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await authorizeStaffQueue(request, response, siteId);

  if (!auth) {
    return;
  }

  const payload = await getStaffSiteOpsPayload(siteId, auth.membership.role, auth.currentUser);

  if (!payload) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  sendJson(response, 200, payload);
}

export async function handleStaffSiteSettings(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await authorizeStaffAdmin(request, response, siteId);

  if (!auth) {
    return;
  }

  const input = staffSiteSettingsInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      name: true,
      distanceKm: true,
      notificationAheadCount: true,
      addressLine1: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!site) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const hasLatitude = Object.prototype.hasOwnProperty.call(input.data, "latitude");
  const hasLongitude = Object.prototype.hasOwnProperty.call(input.data, "longitude");
  const nextLatitude = hasLatitude ? (input.data.latitude ?? null) : site.latitude;
  const nextLongitude = hasLongitude ? (input.data.longitude ?? null) : site.longitude;
  const locationWasUpdated = hasLatitude || hasLongitude;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.site.update({
      where: { id: siteId },
      data: {
        name: input.data.name,
        distanceKm: input.data.distanceKm,
        notificationAheadCount: input.data.notificationAheadCount,
        addressLine1: input.data.addressLine1,
        city: input.data.city,
        region: input.data.region,
        postalCode: input.data.postalCode,
        country: input.data.country,
        latitude: input.data.latitude,
        longitude: input.data.longitude,
        ...(locationWasUpdated
          ? {
              locationSource: nextLatitude === null || nextLongitude === null ? null : "staff_admin",
              locationVerifiedAt: nextLatitude === null || nextLongitude === null ? null : new Date(),
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        distanceKm: true,
        notificationAheadCount: true,
        addressLine1: true,
        city: true,
        region: true,
        postalCode: true,
        country: true,
        latitude: true,
        longitude: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.currentUser.id,
        action: "site.settings.update",
        metadata: {
          siteId,
          before: site,
          after: result,
        },
      },
    });

    return result;
  });

  logOperationalEvent("info", "qdoc.site_settings_updated", {
    actorId: auth.currentUser.id,
    siteId,
  });
  sendJson(response, 200, { site: serializeSiteSettings(updated) });
}

export async function handleStaffQueueSettings(
  request: IncomingMessage,
  response: ServerResponse,
  siteId: string,
  queueId: string,
) {
  const auth = await authorizeStaffQueue(request, response, siteId);

  if (!auth) {
    return;
  }

  const input = staffQueueSettingsInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const queue = await prisma.queue.findFirst({
    where: {
      id: queueId,
      siteId,
    },
    select: {
      id: true,
      name: true,
      isOpen: true,
    },
  });

  if (!queue) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.queue.update({
      where: { id: queueId },
      data: {
        isOpen: input.data.isOpen,
      },
      select: {
        id: true,
        name: true,
        isOpen: true,
      },
    });

    if (queue.isOpen !== result.isOpen) {
      await tx.auditLog.create({
        data: {
          actorId: auth.currentUser.id,
          action: result.isOpen ? "queue.open" : "queue.close",
          metadata: {
            siteId,
            queueId,
            before: queue,
            after: result,
          },
        },
      });
    }

    return result;
  });

  logOperationalEvent("info", "qdoc.queue_settings_updated", {
    actorId: auth.currentUser.id,
    siteId,
    queueId,
    isOpen: updated.isOpen,
  });
  sendJson(response, 200, { queue: staffQueueSummarySchema.parse(updated) });
}

export async function handleStaffMemberships(request: IncomingMessage, response: ServerResponse, siteId: string) {
  if (!(await authorizeStaffAdmin(request, response, siteId))) {
    return;
  }

  sendJson(response, 200, { memberships: await getSiteMemberships(siteId) });
}

export async function handleCreateStaffMembership(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await authorizeStaffAdmin(request, response, siteId);

  if (!auth) {
    return;
  }

  const input = staffMembershipInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: {
        email: input.data.email,
      },
      update: {},
      create: {
        email: input.data.email,
      },
      select: {
        id: true,
      },
    });
    const existing = await tx.membership.findUnique({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId,
        },
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });
    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: {
            role: input.data.role,
          },
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        })
      : await tx.membership.create({
          data: {
            userId: user.id,
            siteId,
            role: input.data.role,
          },
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        });

    await tx.auditLog.create({
      data: {
        actorId: auth.currentUser.id,
        action: existing ? "membership.update" : "membership.create",
        metadata: {
          siteId,
          membershipId: membership.id,
          email: membership.user.email,
          before: existing ? { role: existing.role } : null,
          after: { role: membership.role },
        },
      },
    });

    return membership;
  });

  sendJson(response, 200, { membership: serializeMembership(result) });
}

export async function handleUpdateStaffMembership(
  request: IncomingMessage,
  response: ServerResponse,
  siteId: string,
  membershipId: string,
) {
  const auth = await authorizeStaffAdmin(request, response, siteId);

  if (!auth) {
    return;
  }

  const input = staffMembershipRoleInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const existing = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      siteId,
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!existing) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  if (existing.role === "admin" && input.data.role !== "admin" && !(await ensureAnotherSiteAdmin(siteId, membershipId))) {
    sendJson(response, 409, { error: "conflict" });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.membership.update({
      where: { id: membershipId },
      data: {
        role: input.data.role,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.currentUser.id,
        action: "membership.update",
        metadata: {
          siteId,
          membershipId,
          email: result.user.email,
          before: { role: existing.role },
          after: { role: result.role },
        },
      },
    });

    return result;
  });

  sendJson(response, 200, { membership: serializeMembership(updated) });
}

export async function handleDeleteStaffMembership(
  request: IncomingMessage,
  response: ServerResponse,
  siteId: string,
  membershipId: string,
) {
  const auth = await authorizeStaffAdmin(request, response, siteId);

  if (!auth) {
    return;
  }

  const existing = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      siteId,
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!existing) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  if (existing.role === "admin" && !(await ensureAnotherSiteAdmin(siteId, membershipId))) {
    sendJson(response, 409, { error: "conflict" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({
      where: { id: membershipId },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.currentUser.id,
        action: "membership.delete",
        metadata: {
          siteId,
          membershipId,
          email: existing.user.email,
          before: { role: existing.role },
          after: null,
        },
      },
    });
  });

  sendJson(response, 200, { ok: true });
}

export async function handleStaffMapSettings(request: IncomingMessage, response: ServerResponse) {
  if (!(await authorizeMapSettingsAdmin(request, response))) {
    return;
  }

  sendJson(response, 200, { mapSettings: await getStaffMapSettingsPayload() });
}

export async function handleUpdateStaffMapSettings(request: IncomingMessage, response: ServerResponse) {
  const currentUser = await authorizeMapSettingsAdmin(request, response);

  if (!currentUser) {
    return;
  }

  const input = staffMapSettingsInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const configuredProvider = getConfiguredMapProvider();

  if (configuredProvider && configuredProvider !== input.data.provider) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const before = await prisma.mapProviderConfig.findUnique({
    where: {
      provider: input.data.provider,
    },
  });

  await prisma.$transaction(async (tx) => {
    const after = await tx.mapProviderConfig.upsert({
      where: {
        provider: input.data.provider,
      },
      update: {
        isEnabled: input.data.isEnabled,
        hardStopEnabled: input.data.hardStopEnabled,
        monthlyMapLoadLimit: input.data.monthlyMapLoadLimit,
        monthlyPlacesSearchLimit: input.data.monthlyPlacesSearchLimit,
      },
      create: {
        provider: input.data.provider,
        isEnabled: input.data.isEnabled,
        hardStopEnabled: input.data.hardStopEnabled,
        monthlyMapLoadLimit: input.data.monthlyMapLoadLimit,
        monthlyPlacesSearchLimit: input.data.monthlyPlacesSearchLimit,
      },
    });

    await tx.mapProviderConfigAudit.create({
      data: {
        provider: input.data.provider,
        action: "map_config.update",
        actorId: currentUser.id,
        isEnabledBefore: before?.isEnabled ?? null,
        isEnabledAfter: after.isEnabled,
        monthlyMapLoadLimitBefore: before?.monthlyMapLoadLimit ?? null,
        monthlyMapLoadLimitAfter: after.monthlyMapLoadLimit,
        monthlyPlacesSearchLimitBefore: before?.monthlyPlacesSearchLimit ?? null,
        monthlyPlacesSearchLimitAfter: after.monthlyPlacesSearchLimit,
        hardStopEnabledBefore: before?.hardStopEnabled ?? null,
        hardStopEnabledAfter: after.hardStopEnabled,
        metadata: {
          source: "staff_ops",
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: "map_config.update",
        metadata: {
          provider: input.data.provider,
          before: before
            ? {
                isEnabled: before.isEnabled,
                hardStopEnabled: before.hardStopEnabled,
                monthlyMapLoadLimit: before.monthlyMapLoadLimit,
                monthlyPlacesSearchLimit: before.monthlyPlacesSearchLimit,
              }
            : null,
          after: {
            isEnabled: after.isEnabled,
            hardStopEnabled: after.hardStopEnabled,
            monthlyMapLoadLimit: after.monthlyMapLoadLimit,
            monthlyPlacesSearchLimit: after.monthlyPlacesSearchLimit,
          },
        },
      },
    });
  });

  logOperationalEvent("info", "qdoc.map_settings_updated", {
    actorId: currentUser.id,
    provider: input.data.provider,
    isEnabled: input.data.isEnabled,
    hardStopEnabled: input.data.hardStopEnabled,
    monthlyMapLoadLimit: input.data.monthlyMapLoadLimit,
    monthlyPlacesSearchLimit: input.data.monthlyPlacesSearchLimit,
  });
  sendJson(response, 200, { mapSettings: await getStaffMapSettingsPayload(input.data.provider) });
}

export async function handleStaffAuditLogs(request: IncomingMessage, response: ServerResponse, siteId: string) {
  if (!(await authorizeStaffAdmin(request, response, siteId))) {
    return;
  }

  sendJson(response, 200, { auditLogs: await getSiteAuditLogs(siteId) });
}

export async function handleStaffTicketAction(
  request: IncomingMessage,
  response: ServerResponse,
  ticketId: string,
  action: StaffTicketAction,
) {
  const transition = ticketTransitionByAction[action];
  const currentUser = await getCurrentUserFromRequest(request);

  if (!currentUser) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  const input = staffTicketActionInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const allowedSiteIds = currentUser.memberships
    .filter((membership) => membership.role === "staff" || membership.role === "admin")
    .map((membership) => membership.siteId);

  if (!allowedSiteIds.includes(input.data.siteId)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      siteId: input.data.siteId,
    },
    select: {
      id: true,
      siteId: true,
      queueId: true,
      userId: true,
      status: true,
      site: {
        select: {
          notificationAheadCount: true,
        },
      },
    },
  });

  if (!ticket) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  if (!transition.from.includes(ticket.status)) {
    sendJson(response, 409, { error: "invalid_transition" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const restoreSortRank =
      action === "restore"
        ? await tx.ticket
            .findFirst({
              where: {
                siteId: ticket.siteId,
                queueId: ticket.queueId,
                status: "waiting",
              },
              orderBy: [
                {
                  sortRank: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
              select: {
                sortRank: true,
              },
            })
            .then((frontTicket) => new Date((frontTicket?.sortRank ?? new Date()).getTime() - 1000))
        : null;

    const updated = await tx.ticket.updateMany({
      where: {
        id: ticket.id,
        status: ticket.status,
      },
      data: {
        status: transition.to,
        ...(restoreSortRank ? { sortRank: restoreSortRank } : {}),
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    await tx.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        status: transition.to,
        note: transition.auditAction,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: transition.auditAction,
        metadata: {
          ticketId: ticket.id,
          siteId: ticket.siteId,
          fromStatus: ticket.status,
          toStatus: transition.to,
        },
      },
    });

    const notification = await tx.notificationLog.create({
      data: {
        ticketId: ticket.id,
        channel: "in_app",
        message: getTicketStatusMessage(transition.to),
      },
    });

    await tx.outbox.create({
      data: {
        type: "ticket.status_changed",
        payload: {
          ticketId: ticket.id,
          siteId: ticket.siteId,
          queueId: ticket.queueId,
          userId: ticket.userId,
          notificationLogId: notification.id,
          fromStatus: ticket.status,
          toStatus: transition.to,
          action: transition.auditAction,
        },
      },
    });

    const waitingTickets = await tx.ticket.findMany({
      where: {
        siteId: ticket.siteId,
        queueId: ticket.queueId,
        status: "waiting",
      },
      orderBy: [
        {
          sortRank: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
      include: {
        site: {
          select: {
            name: true,
          },
        },
        queue: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            email: true,
            emailNotificationsEnabled: true,
          },
        },
      },
    });

    const notificationAheadCount = ticket.site.notificationAheadCount;

    if (notificationAheadCount > 0) {
      for (const queueTicket of waitingTickets.slice(0, notificationAheadCount + 1)) {
        const existingInAppAlmostReadyNotification = await tx.notificationLog.findFirst({
          where: {
            ticketId: queueTicket.id,
            channel: "in_app",
            message: almostReadyMessage,
          },
          select: {
            id: true,
          },
        });

        if (!existingInAppAlmostReadyNotification) {
          await tx.notificationLog.create({
            data: {
              ticketId: queueTicket.id,
              channel: "in_app",
              message: almostReadyMessage,
            },
          });
        }
      }
    }

    const almostReadyTicket = notificationAheadCount > 0 ? waitingTickets[notificationAheadCount] : null;

    if (almostReadyTicket?.user.emailNotificationsEnabled) {
      const existingAlmostReadyNotification = await tx.notificationLog.findFirst({
        where: {
          ticketId: almostReadyTicket.id,
          channel: "email",
          message: almostReadyMessage,
        },
        select: {
          id: true,
        },
      });

      if (!existingAlmostReadyNotification) {
        const almostReadyNotification = await tx.notificationLog.create({
          data: {
            ticketId: almostReadyTicket.id,
            channel: "email",
            message: almostReadyMessage,
          },
        });

        await tx.outbox.create({
          data: {
            type: "ticket.almost_ready_email",
            payload: {
              ticketId: almostReadyTicket.id,
              siteId: almostReadyTicket.siteId,
              siteName: almostReadyTicket.site.name,
              queueId: almostReadyTicket.queueId,
              queueName: almostReadyTicket.queue.name,
              userId: almostReadyTicket.userId,
              userEmail: almostReadyTicket.user.email,
              aheadCount: notificationAheadCount,
              notificationLogId: almostReadyNotification.id,
            },
          },
        });
      }
    }

    return tx.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        site: {
          select: {
            name: true,
          },
        },
        queue: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
    });
  });

  if (!result) {
    sendJson(response, 409, { error: "conflict" });
    return;
  }

  logOperationalEvent("info", "qdoc.queue_transition", {
    ticketId: maskIdentifier(ticket.id),
    siteId: ticket.siteId,
    queueId: ticket.queueId,
    actorId: maskIdentifier(currentUser.id),
    action,
    fromStatus: ticket.status,
    toStatus: transition.to,
  });

  sendJson(
    response,
    200,
    staffTicketResponseSchema.parse({
      ticket: serializeStaffTicket(result),
    }),
  );
}

export function isStaffTicketAction(action: string): action is StaffTicketAction {
  return Object.hasOwn(ticketTransitionByAction, action);
}
