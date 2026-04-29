import { createServer } from "node:http";
import { activeTicketStatuses } from "@qdoc/contracts";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "4000");

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        service: "api",
        activeTicketStatuses,
      }),
    );
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, host, () => {
  console.log(`QDoc API listening on http://${host}:${port}`);
});
