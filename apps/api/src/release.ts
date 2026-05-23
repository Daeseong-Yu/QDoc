import type { ServerResponse } from "node:http";
import { sendJson } from "./http.js";

const gitShaPattern = /^[0-9a-f]{40}$/i;

function normalizeGitSha(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || !gitShaPattern.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

function parseImageTag(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const tag = trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
  return normalizeGitSha(tag);
}

export function getReleaseIdentity() {
  const releaseSha = normalizeGitSha(process.env.QDOC_RELEASE_SHA) ?? parseImageTag(process.env.QDOC_APP_IMAGE);

  return {
    service: "qdoc",
    releaseSha,
    hasReleaseIdentity: releaseSha !== null,
  };
}

export function handleReleaseIdentity(response: ServerResponse) {
  sendJson(response, 200, getReleaseIdentity(), {
    "cache-control": "no-store",
  });
}
