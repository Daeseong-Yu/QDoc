import type { IncomingMessage, ServerResponse } from "node:http";

type SnapshotLoader<T> = () => Promise<T>;

const snapshotIntervalMs = 4000;
const heartbeatIntervalMs = 20000;
const activeStreamCounts = new Map<string, number>();

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function reserveStream(streamKey: string) {
  const maxStreamsPerKey = getPositiveIntegerEnv("SSE_MAX_STREAMS_PER_KEY", 3);
  const currentCount = activeStreamCounts.get(streamKey) ?? 0;

  if (currentCount >= maxStreamsPerKey) {
    return false;
  }

  activeStreamCounts.set(streamKey, currentCount + 1);
  return true;
}

function releaseStream(streamKey: string) {
  const currentCount = activeStreamCounts.get(streamKey) ?? 0;

  if (currentCount <= 1) {
    activeStreamCounts.delete(streamKey);
    return;
  }

  activeStreamCounts.set(streamKey, currentCount - 1);
}

function writeEvent<T>(response: ServerResponse, event: string, data: T) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function streamSnapshots<T>(
  request: IncomingMessage,
  response: ServerResponse,
  streamKey: string,
  loadSnapshot: SnapshotLoader<T>,
) {
  if (!reserveStream(streamKey)) {
    response.writeHead(429, {
      "content-type": "application/json",
      "retry-after": "30",
    });
    response.end(JSON.stringify({ error: "rate_limited" }));
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  let closed = false;
  let loading = false;
  let snapshotTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;

  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    releaseStream(streamKey);

    if (snapshotTimer) {
      clearInterval(snapshotTimer);
    }

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }

    if (lifetimeTimer) {
      clearTimeout(lifetimeTimer);
    }

    if (!response.destroyed) {
      response.end();
    }
  };

  const sendSnapshot = async () => {
    if (closed || loading) {
      return;
    }

    loading = true;

    try {
      writeEvent(response, "snapshot", await loadSnapshot());
    } catch {
      writeEvent(response, "error", { error: "internal_error" });
      close();
    } finally {
      loading = false;
    }
  };

  snapshotTimer = setInterval(() => {
    void sendSnapshot();
  }, snapshotIntervalMs);
  heartbeatTimer = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, heartbeatIntervalMs);
  lifetimeTimer = setTimeout(close, getPositiveIntegerEnv("SSE_MAX_STREAM_LIFETIME_MS", 5 * 60 * 1000));

  request.on("close", close);
  response.on("close", close);
  void sendSnapshot();
}
