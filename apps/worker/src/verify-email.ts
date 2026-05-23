import nodemailer from "nodemailer";

type EmailCheck = {
  name: string;
  ok: boolean;
  status: string;
};

const productionLikeEnvironments = new Set(["staging", "production"]);
const placeholderPatterns = [/replace-with/i, /change-me/i, /example/i];
const smtpRequiredEnv = ["EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"];

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isTruthy(name: string) {
  return env(name).toLowerCase() === "true";
}

function isProductionLike() {
  return productionLikeEnvironments.has(env("APP_ENV").toLowerCase()) || env("NODE_ENV") === "production";
}

function hasPlaceholderValue(value: string) {
  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function hasRequiredEnv(names: string[]) {
  return names.every((name) => env(name).length > 0);
}

function hasPlaceholderEnv(names: string[]) {
  return names.some((name) => hasPlaceholderValue(env(name)));
}

function isValidPort(name: string) {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535;
}

function getSmtpPort() {
  return Number.parseInt(env("SMTP_PORT") || "587", 10);
}

function getTimeoutMs() {
  const parsed = Number.parseInt(env("QDOC_VERIFY_SMTP_TIMEOUT_MS"), 10);

  if (!Number.isInteger(parsed)) {
    return 10_000;
  }

  return Math.min(Math.max(parsed, 1_000), 60_000);
}

function check(name: string, ok: boolean, readyStatus: string, failedStatus: string): EmailCheck {
  return {
    name,
    ok,
    status: ok ? readyStatus : failedStatus,
  };
}

async function verifySmtpConnectivity(input: {
  provider: string;
  requested: boolean;
  smtpLaunchSafe: boolean;
  smtpShapeOk: boolean;
}): Promise<EmailCheck> {
  if (input.provider !== "smtp") {
    return check("smtp_connectivity", true, "not_required_for_non_smtp_provider", "smtp_required");
  }

  if (!input.requested) {
    return check("smtp_connectivity", true, "not_requested", "not_requested");
  }

  if (!input.smtpShapeOk || !input.smtpLaunchSafe) {
    return check("smtp_connectivity", false, "verified", "precondition_failed");
  }

  const timeoutMs = getTimeoutMs();
  const transporter = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: getSmtpPort(),
    secure: isTruthy("SMTP_SECURE"),
    requireTLS: true,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: Math.max(timeoutMs, 15_000),
    auth: {
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
  });

  try {
    await transporter.verify();
    return check("smtp_connectivity", true, "verified_without_sending_email", "failed");
  } catch {
    return check("smtp_connectivity", false, "verified_without_sending_email", "failed");
  } finally {
    transporter.close();
  }
}

async function getChecks() {
  const productionLike = isProductionLike();
  const providerRaw = env("EMAIL_PROVIDER").toLowerCase();
  const apiProvider = providerRaw || "console";
  const providerKnownForApi = apiProvider === "console" || apiProvider === "smtp";
  const providerKnownForWorker = providerKnownForApi;
  const smtpShapeOk = apiProvider !== "smtp" || (hasRequiredEnv(smtpRequiredEnv) && isValidPort("SMTP_PORT"));
  const smtpLaunchSafe = apiProvider !== "smtp" || !productionLike || !hasPlaceholderEnv(smtpRequiredEnv);
  const apiConsoleAllowed =
    apiProvider === "console" &&
    (env("NODE_ENV") !== "production" || (env("APP_ENV") === "staging" && isTruthy("ALLOW_CONSOLE_OTP")));
  const workerConsoleAllowed = apiProvider === "console" && env("NODE_ENV") !== "production";
  const smtpConnectivityRequested = isTruthy("QDOC_VERIFY_SMTP_CONNECTIVITY");

  const checks: EmailCheck[] = [
    check("email_provider_known_to_api", providerKnownForApi, "known", "unsupported_provider"),
    check("email_provider_known_to_worker", providerKnownForWorker, "known", "missing_or_unsupported_provider"),
    check(
      "launch_email_provider_policy",
      !productionLike || providerRaw === "smtp",
      productionLike ? "smtp_required_and_selected" : "non_launch_env_allows_console",
      "smtp_required_for_launch",
    ),
    check(
      "api_otp_delivery_gate",
      providerKnownForApi && (apiProvider === "smtp" ? smtpShapeOk : apiConsoleAllowed),
      apiProvider === "smtp" ? "smtp_config_allows_request" : "console_delivery_allowed",
      apiProvider === "smtp" ? "smtp_config_incomplete" : "console_delivery_not_allowed",
    ),
    check(
      "worker_email_delivery_gate",
      providerKnownForWorker && (apiProvider === "smtp" ? smtpShapeOk : workerConsoleAllowed),
      apiProvider === "smtp" ? "smtp_config_allows_worker_delivery" : "console_delivery_allowed",
      apiProvider === "smtp" ? "smtp_config_incomplete" : "console_delivery_not_allowed",
    ),
    check(
      "smtp_config_shape",
      apiProvider !== "smtp" || smtpShapeOk,
      apiProvider === "smtp" ? "configured" : "not_required_for_non_smtp_provider",
      "smtp_config_incomplete",
    ),
    check(
      "smtp_placeholder_values",
      smtpLaunchSafe,
      apiProvider === "smtp" && productionLike ? "no_launch_placeholders_detected" : "not_required_for_non_launch_env",
      "placeholder_smtp_values_detected",
    ),
  ];

  checks.push(
    await verifySmtpConnectivity({
      provider: apiProvider,
      requested: smtpConnectivityRequested,
      smtpLaunchSafe,
      smtpShapeOk,
    }),
  );

  return checks;
}

const checks = await getChecks();
const payload = {
  ok: checks.every((item) => item.ok),
  generatedAt: new Date().toISOString(),
  target: {
    appEnv: env("APP_ENV") || "unset",
    nodeEnv: env("NODE_ENV") || "unset",
    productionLike: isProductionLike(),
    smtpConnectivityRequested: isTruthy("QDOC_VERIFY_SMTP_CONNECTIVITY"),
  },
  checks,
};

console.log(JSON.stringify(payload, null, 2));

if (!payload.ok) {
  process.exitCode = 1;
}
