import type { IncomingMessage, ServerResponse } from "node:http";
import {
  activeTicketStatuses,
  staffQueueResponseSchema,
  staffTicketActionInputSchema,
  staffTicketResponseSchema,
  type TicketStatus,
} from "@qdoc/contracts";
import { prisma } from "@qdoc/db";
import { readJson, sendJson } from "./http.js";
import { getCurrentUserFromRequest, requireStaffMembership } from "./auth.js";

type StaffTicketAction = "call" | "start-service" | "complete" | "no-show" | "cancel";

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
  "no-show": {
    from: ["called"],
    to: "no_show",
    auditAction: "ticket.no_show",
  },
  cancel: {
    from: ["waiting", "called"],
    to: "cancelled",
    auditAction: "ticket.cancel",
  },
};

const ticketStatusLabels: Record<TicketStatus, string> = {
  waiting: "waiting",
  called: "called",
  in_service: "in service",
  completed: "completed",
  no_show: "no-show",
  cancelled: "cancelled",
};

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
    patientEmail: ticket.user.email,
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
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export async function handleStaffQueue(request: IncomingMessage, response: ServerResponse, siteId: string) {
  const auth = await requireStaffMembership(request, siteId);

  if (auth.status === "unauthorized") {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  if (auth.status === "forbidden") {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

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
    staffQueueResponseSchema.parse({
      siteId: site.id,
      siteName: site.name,
      queues: site.queues,
      tickets: site.tickets.map(serializeStaffQueueTicket),
    }),
  );
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
    const updated = await tx.ticket.updateMany({
      where: {
        id: ticket.id,
        status: ticket.status,
      },
      data: {
        status: transition.to,
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
