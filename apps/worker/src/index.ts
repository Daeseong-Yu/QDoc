import { prisma } from "@qdoc/db";

type OutboxItem = Awaited<ReturnType<typeof loadPendingOutboxItems>>[number];

const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? "5000");
const batchSize = Number(process.env.WORKER_OUTBOX_BATCH_SIZE ?? "10");
const maxAttempts = Number(process.env.WORKER_OUTBOX_MAX_ATTEMPTS ?? "5");
const processingTimeoutMs = Number(process.env.WORKER_OUTBOX_PROCESSING_TIMEOUT_MS ?? "60000");
const shutdownGraceMs = Number(process.env.WORKER_SHUTDOWN_GRACE_MS ?? "10000");

let shuttingDown = false;
let activeBatch: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPayloadString(payload: unknown, key: string) {
  if (!isRecord(payload) || typeof payload[key] !== "string") {
    throw new Error(`Invalid outbox payload: ${key}`);
  }

  return payload[key];
}

function getRetryDelayMs(attempts: number) {
  return Math.min(60_000, 1000 * 2 ** attempts);
}

async function loadPendingOutboxItems() {
  const now = new Date();
  const staleProcessingCutoff = new Date(Date.now() - processingTimeoutMs);

  return prisma.outbox.findMany({
    where: {
      OR: [
        {
          status: "pending",
          availableAt: {
            lte: now,
          },
        },
        {
          status: "processing",
          updatedAt: {
            lte: staleProcessingCutoff,
          },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    take: batchSize,
  });
}

async function claimOutboxItem(item: OutboxItem) {
  const now = new Date();
  const staleProcessingCutoff = new Date(Date.now() - processingTimeoutMs);
  const claimed = await prisma.outbox.updateMany({
    where: {
      id: item.id,
      OR: [
        {
          status: "pending",
          availableAt: {
            lte: now,
          },
        },
        {
          status: "processing",
          updatedAt: {
            lte: staleProcessingCutoff,
          },
        },
      ],
    },
    data: {
      status: "processing",
    },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.outbox.findUnique({
    where: {
      id: item.id,
    },
  });
}

async function processTicketStatusChanged(item: OutboxItem) {
  const notificationLogId = getPayloadString(item.payload, "notificationLogId");

  const notification = await prisma.notificationLog.findUnique({
    where: {
      id: notificationLogId,
    },
    select: {
      id: true,
    },
  });

  if (!notification) {
    throw new Error("Notification log not found");
  }
}

async function processOutboxItem(item: OutboxItem) {
  if (item.type === "ticket.status_changed") {
    await processTicketStatusChanged(item);
    return;
  }

  throw new Error(`Unsupported outbox type: ${item.type}`);
}

async function markOutboxProcessed(item: OutboxItem) {
  await prisma.outbox.updateMany({
    where: {
      id: item.id,
      status: "processing",
      updatedAt: item.updatedAt,
    },
    data: {
      status: "processed",
      processedAt: new Date(),
    },
  });
}

async function markOutboxFailed(item: OutboxItem, error: unknown) {
  const attempts = item.attempts + 1;
  const shouldRetry = attempts < maxAttempts;

  const failed = await prisma.outbox.updateMany({
    where: {
      id: item.id,
      status: "processing",
      updatedAt: item.updatedAt,
    },
    data: {
      status: shouldRetry ? "pending" : "failed",
      attempts,
      availableAt: new Date(Date.now() + getRetryDelayMs(item.attempts)),
    },
  });

  if (failed.count !== 1) {
    return;
  }

  console.error("Outbox item failed", {
    id: item.id,
    type: item.type,
    attempts,
    willRetry: shouldRetry,
    error: error instanceof Error ? error.message : "Unknown error",
  });
}

async function processOutboxBatch() {
  const items = await loadPendingOutboxItems();

  for (const item of items) {
    const claimed = await claimOutboxItem(item);

    if (!claimed) {
      continue;
    }

    try {
      await processOutboxItem(claimed);
      await markOutboxProcessed(claimed);
    } catch (error) {
      await markOutboxFailed(claimed, error);
    }
  }
}

async function runWorkerLoop() {
  while (!shuttingDown) {
    try {
      activeBatch = processOutboxBatch();
      await activeBatch;
    } catch (error) {
      console.error("Outbox worker poll failed", error);
    } finally {
      activeBatch = null;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function shutdown() {
  shuttingDown = true;

  if (activeBatch) {
    await Promise.race([activeBatch, new Promise((resolve) => setTimeout(resolve, shutdownGraceMs))]);
  }

  await prisma.$disconnect();
}

console.log("QDoc worker started", {
  intervalMs,
  batchSize,
  maxAttempts,
  processingTimeoutMs,
  shutdownGraceMs,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });
}

void runWorkerLoop();
