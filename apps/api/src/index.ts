import { createServer } from "node:http";
import { activeTicketStatuses } from "@qdoc/contracts";
import { handleLogout, handleMe, handleOtpRequest, handleOtpVerify } from "./auth.js";
import { sendJson } from "./http.js";
import { handleActiveTicket, handleCheckIn, handleSiteQueues, handleSites } from "./patient.js";
import { handleStaffQueue } from "./staff.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "4000");

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "api",
        activeTicketStatuses,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/otp/request") {
      await handleOtpRequest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/otp/verify") {
      await handleOtpVerify(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/logout") {
      await handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/me") {
      await handleMe(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/sites") {
      await handleSites(request, response);
      return;
    }

    const siteQueuesMatch = url.pathname.match(/^\/sites\/([^/]+)\/queues$/);

    if (request.method === "GET" && siteQueuesMatch?.[1]) {
      await handleSiteQueues(request, response, siteQueuesMatch[1]);
      return;
    }

    const checkInMatch = url.pathname.match(/^\/sites\/([^/]+)\/check-ins$/);

    if (request.method === "POST" && checkInMatch?.[1]) {
      await handleCheckIn(request, response, checkInMatch[1]);
      return;
    }

    if (request.method === "GET" && url.pathname === "/patients/me/tickets/active") {
      await handleActiveTicket(request, response);
      return;
    }

    const staffQueueMatch = url.pathname.match(/^\/staff\/sites\/([^/]+)\/queue$/);

    if (request.method === "GET" && staffQueueMatch?.[1]) {
      await handleStaffQueue(request, response, staffQueueMatch[1]);
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "invalid_request" });
      return;
    }

    if (error instanceof Error && error.message === "request_body_too_large") {
      sendJson(response, 413, { error: "invalid_request" });
      return;
    }

    console.error(error);
    sendJson(response, 500, { error: "internal_error" });
  }
});

server.listen(port, host, () => {
  console.log(`QDoc API listening on http://${host}:${port}`);
});
