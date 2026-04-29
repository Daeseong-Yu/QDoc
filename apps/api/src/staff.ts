import type { IncomingMessage, ServerResponse } from "node:http";
import { staffQueueResponseSchema } from "@qdoc/contracts";
import { prisma } from "@qdoc/db";
import { sendJson } from "./http.js";
import { requireStaffMembership } from "./auth.js";

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
    }),
  );
}
