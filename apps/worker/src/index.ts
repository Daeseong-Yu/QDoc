import { writeFile } from "node:fs/promises";
import { logOperationalEvent } from "./ops-log.js";
import { startOutboxWorker } from "./outbox.js";

const worker = startOutboxWorker();
const healthFile = process.env.WORKER_HEALTH_FILE ?? "/tmp/qdoc-worker-health.json";
const healthIntervalMs = 10_000;

async function writeWorkerHealth() {
  await writeFile(
    healthFile,
    JSON.stringify(
      {
        ok: true,
        service: "worker",
        updatedAt: new Date().toISOString(),
        config: {
          intervalMs: worker.config.intervalMs,
          batchSize: worker.config.batchSize,
          maxAttempts: worker.config.maxAttempts,
          processingTimeoutMs: worker.config.processingTimeoutMs,
        },
      },
      null,
      2,
    ),
  );
}

void writeWorkerHealth().catch((error) => {
  logOperationalEvent("error", "qdoc.worker_health_write_failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
});

const healthTimer = setInterval(() => {
  void writeWorkerHealth().catch((error) => {
    logOperationalEvent("error", "qdoc.worker_health_write_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  });
}, healthIntervalMs);

console.log("QDoc worker started", worker.config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(healthTimer);
    void worker.stop().finally(() => {
      process.exit(0);
    });
  });
}
