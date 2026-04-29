import type { IncomingMessage, ServerResponse } from "node:http";
import {
  activeTicketsResponseSchema,
  activeTicketStatuses,
  checkInInputSchema,
  checkInResponseSchema,
  patientQueuesResponseSchema,
  patientSitesResponseSchema,
  type TicketStatus,
} from "@qdoc/contracts";
import { prisma } from "@qdoc/db";
import { getCurrentUserFromRequest } from "./auth.js";
import { readJson, sendJson } from "./http.js";

type PatientTicketRecord = {
  id: string;
  siteId: string;
  queueId: string;
  status: TicketStatus;
  createdAt: Date;
  site: {
    name: string;
  };
  queue: {
    name: string;
  };
};

function serializePatientTicket(ticket: PatientTicketRecord) {
  return {
    id: ticket.id,
    siteId: ticket.siteId,
    siteName: ticket.site.name,
    queueId: ticket.queueId,
    queueName: ticket.queue.name,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
  };
}

export async function handleSites(_request: IncomingMessage, response: ServerResponse) {
  const sites = await prisma.site.findMany({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          queues: true,
        },
      },
    },
  });

  sendJson(
    response,
    200,
    patientSitesResponseSchema.parse({
      sites: sites.map((site) => ({
        id: site.id,
        name: site.name,
        queueCount: site._count.queues,
      })),
    }),
  );
}

export async function handleSiteQueues(_request: IncomingMessage, response: ServerResponse, siteId: string) {
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
    },
  });

  if (!site) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  sendJson(
    response,
    200,
    patientQueuesResponseSchema.parse({
      siteId: site.id,
      siteName: site.name,
      queues: site.queues,
    }),
  );
}

export async function handleCheckIn(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const currentUser = await getCurrentUserFromRequest(request);

  if (!currentUser) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  const input = checkInInputSchema.safeParse(await readJson(request));

  if (!input.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const queue = await tx.queue.findFirst({
        where: {
          id: input.data.queueId,
          siteId,
        },
        select: {
          id: true,
          isOpen: true,
        },
      });

      if (!queue) {
        return { status: "not_found" as const };
      }

      if (!queue.isOpen) {
        return { status: "queue_closed" as const };
      }

      const activeTicket = await tx.ticket.findFirst({
        where: {
          userId: currentUser.id,
          siteId,
          status: {
            in: activeTicketStatuses,
          },
        },
        select: {
          id: true,
        },
      });

      if (activeTicket) {
        return { status: "conflict" as const };
      }

      const createdTicket = await tx.ticket.create({
        data: {
          siteId,
          queueId: queue.id,
          userId: currentUser.id,
          status: "waiting",
          events: {
            create: {
              status: "waiting",
              note: "patient_check_in",
            },
          },
        },
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
        },
      });

      return { status: "created" as const, ticket: createdTicket };
    });

    if (ticket.status === "not_found") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    if (ticket.status === "queue_closed") {
      sendJson(response, 409, { error: "queue_closed" });
      return;
    }

    if (ticket.status === "conflict") {
      sendJson(response, 409, { error: "conflict" });
      return;
    }

    sendJson(
      response,
      201,
      checkInResponseSchema.parse({
        ticket: serializePatientTicket(ticket.ticket),
      }),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      sendJson(response, 409, { error: "conflict" });
      return;
    }

    throw error;
  }
}

export async function handleActiveTicket(request: IncomingMessage, response: ServerResponse) {
  const currentUser = await getCurrentUserFromRequest(request);

  if (!currentUser) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      userId: currentUser.id,
      status: {
        in: activeTicketStatuses,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
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
    },
  });

  sendJson(
    response,
    200,
    activeTicketsResponseSchema.parse({
      tickets: tickets.map(serializePatientTicket),
    }),
  );
}
