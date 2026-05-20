import { createHash } from "node:crypto";

type OperationalLogLevel = "info" | "warn" | "error";
type OperationalLogFields = Record<string, string | number | boolean | null | undefined>;

export function maskIdentifier(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value).digest("base64url").slice(0, 16);
}

export function logOperationalEvent(level: OperationalLogLevel, event: string, fields: OperationalLogFields = {}) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}
