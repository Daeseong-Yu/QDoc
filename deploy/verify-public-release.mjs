#!/usr/bin/env node

const publicUrl = process.env.QDOC_PUBLIC_URL ?? process.env.QDOC_PORTFOLIO_BASE_URL ?? "";
const expectedReleaseSha = (
  process.env.QDOC_EXPECTED_RELEASE_SHA ??
  process.env.QDOC_PORTFOLIO_EXPECT_RELEASE_SHA ??
  process.env.QDOC_RELEASE_SHA ??
  ""
)
  .trim()
  .toLowerCase();
const privateOutput = /^(true|1|yes)$/i.test(process.env.QDOC_PUBLIC_RELEASE_PRIVATE_OUTPUT ?? "");
const gitShaPattern = /^[0-9a-f]{40}$/;

let failures = 0;
let warnings = 0;

function ok(message) {
  console.log(`OK: ${message}`);
}

function warn(message) {
  warnings += 1;
  console.error(`WARN: ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function redactedUrl(value) {
  if (!value) {
    return "<pending>";
  }

  if (privateOutput) {
    return value;
  }

  return "https://<public-domain>";
}

function buildEndpoint(baseUrl, pathname) {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchJson(endpoint) {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await response.text();

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function validateBaseUrl() {
  if (!publicUrl) {
    fail("QDOC_PUBLIC_URL or QDOC_PORTFOLIO_BASE_URL is required");
    return null;
  }

  let baseUrl;
  try {
    baseUrl = new URL(publicUrl);
  } catch {
    fail("Public URL is not a valid URL");
    return null;
  }

  if (baseUrl.protocol !== "https:") {
    fail("Public URL must start with https://");
  } else {
    ok("Public URL uses HTTPS");
  }

  if (baseUrl.username || baseUrl.password) {
    fail("Public URL must not contain credentials");
  }

  return baseUrl;
}

function validateExpectedReleaseSha() {
  if (!expectedReleaseSha) {
    warn("Expected release SHA is not set; this check can verify identity shape but not the deployed candidate");
    return;
  }

  if (gitShaPattern.test(expectedReleaseSha)) {
    ok("Expected release SHA format looks valid");
  } else {
    fail("Expected release SHA must be a 40-character Git SHA");
  }
}

function validateHealth(payload) {
  if (payload && payload.ok === true && payload.service === "api") {
    ok("Public API health endpoint is reachable");
    return;
  }

  fail("Public API health response is not the expected QDoc API health payload");
}

function validateRelease(payload) {
  if (!payload || typeof payload !== "object") {
    fail("Public release response is not JSON");
    return;
  }

  const releaseSha = typeof payload.releaseSha === "string" ? payload.releaseSha.trim().toLowerCase() : "";

  if (payload.hasReleaseIdentity !== true || !gitShaPattern.test(releaseSha)) {
    fail("Public release identity is missing or invalid; redeploy the latest candidate before collecting smoke evidence");
    return;
  }

  ok("Public release identity is present");

  if (!expectedReleaseSha) {
    return;
  }

  if (releaseSha === expectedReleaseSha) {
    ok("Public release identity matches the expected candidate SHA");
  } else {
    fail("Public release identity does not match the expected candidate SHA");
  }
}

async function main() {
  console.log("==> Checking public release identity");
  const baseUrl = validateBaseUrl();
  validateExpectedReleaseSha();

  if (!baseUrl) {
    return;
  }

  console.log(`Public URL: ${redactedUrl(baseUrl.origin)}`);

  const healthEndpoint = buildEndpoint(baseUrl, "/api/health");
  try {
    const health = await fetchJson(healthEndpoint);
    if (!health.ok) {
      fail(`Public API health endpoint returned HTTP ${health.status}`);
    } else {
      validateHealth(health.payload);
    }
  } catch {
    fail("Public API health endpoint could not be reached");
  }

  const releaseEndpoint = buildEndpoint(baseUrl, "/api/release");
  try {
    const release = await fetchJson(releaseEndpoint);
    if (!release.ok) {
      fail(`Public release endpoint returned HTTP ${release.status}`);
    } else {
      validateRelease(release.payload);
    }
  } catch {
    fail("Public release endpoint could not be reached");
  }

  if (failures > 0) {
    console.error(`Public release verification failed with ${failures} failure(s) and ${warnings} warning(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Public release verification passed with ${warnings} warning(s).`);
}

await main();
