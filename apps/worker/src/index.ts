import { activeTicketStatuses } from "@qdoc/contracts";

const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? "5000");

console.log("QDoc worker started", {
  activeTicketStatuses,
  intervalMs,
});

const timer = setInterval(() => {
  console.log("QDoc worker heartbeat");
}, intervalMs);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
