type LaunchCheck = {
  name: string;
  ok: boolean;
  status: string;
};

const productionLikeEnvironments = new Set(["staging", "production"]);
const allowedMapProviders = new Set(["mapbox", "google"]);
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

function getPositiveInteger(name: string) {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function isValidPort(name: string) {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535;
}

function check(name: string, ok: boolean, readyStatus: string, failedStatus: string): LaunchCheck {
  return {
    name,
    ok,
    status: ok ? readyStatus : failedStatus,
  };
}

function getChecks(): LaunchCheck[] {
  const productionLike = isProductionLike();
  const emailProvider = env("EMAIL_PROVIDER").toLowerCase() || "console";
  const sessionSecret = env("SESSION_SECRET");
  const mapProvider = env("MAP_PROVIDER").toLowerCase();
  const mapEnabled = isTruthy("MAP_PROVIDER_ENABLED");
  const mapTokenName = mapProvider === "google" ? "GOOGLE_MAPS_BROWSER_KEY" : "MAPBOX_PUBLIC_TOKEN";
  const mapSearchLimit = getPositiveInteger("MAP_MONTHLY_PLACES_SEARCH_LIMIT");
  const mapSearchEnabled = mapEnabled && mapSearchLimit > 0;
  const mapSearchTokenName = mapProvider === "google" ? "GOOGLE_PLACES_SERVER_KEY" : "MAPBOX_SEARCH_TOKEN";
  const mapRateLimitsOk =
    !mapEnabled || (getPositiveInteger("MAP_USAGE_RATE_LIMIT_PER_MINUTE") > 0 && getPositiveInteger("MAP_USAGE_RATE_LIMIT_PER_HOUR") > 0);
  const mapSearchRateLimitsOk =
    !mapSearchEnabled ||
    (getPositiveInteger("MAP_SEARCH_RATE_LIMIT_PER_MINUTE") > 0 && getPositiveInteger("MAP_SEARCH_RATE_LIMIT_PER_HOUR") > 0);
  const mapSearchCacheOk = !mapSearchEnabled || getPositiveInteger("MAP_SEARCH_CACHE_TTL_SECONDS") > 0;
  const expectedStaffAdmins = env("QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS");
  const staffDemoExpectationsOk = !productionLike || (expectedStaffAdmins.length > 0 && !hasPlaceholderValue(expectedStaffAdmins));
  const smtpShapeOk = emailProvider !== "smtp" || (hasRequiredEnv(smtpRequiredEnv) && isValidPort("SMTP_PORT"));
  const smtpPlaceholderOk = emailProvider !== "smtp" || !productionLike || !hasPlaceholderEnv(smtpRequiredEnv);

  return [
    check("database_url", env("DATABASE_URL").length > 0, "configured", "missing_database_url"),
    check("redis_url", env("REDIS_URL").length > 0, "configured", "missing_redis_url"),
    check(
      "session_secret",
      productionLike
        ? sessionSecret.length >= 32 && !hasPlaceholderValue(sessionSecret)
        : sessionSecret.length > 0,
      productionLike ? "hardened" : "configured_for_non_launch_env",
      productionLike ? "weak_or_placeholder_session_secret" : "missing_session_secret",
    ),
    check(
      "app_url",
      !productionLike || env("APP_URL").startsWith("https://"),
      productionLike ? "https_origin_configured" : "non_launch_env_allows_non_https",
      "app_url_must_use_https",
    ),
    check(
      "web_bind",
      !productionLike || env("QDOC_WEB_BIND") === "127.0.0.1",
      productionLike ? "loopback_only" : "non_launch_env_allows_default_bind",
      "web_bind_must_remain_loopback",
    ),
    check(
      "otp_debug_flags",
      !productionLike || (!isTruthy("ALLOW_FIXED_OTP") && !isTruthy("ALLOW_CONSOLE_OTP")),
      productionLike ? "disabled" : "non_launch_env_allows_debug_flags",
      "otp_debug_flags_enabled",
    ),
    check(
      "email_provider",
      !productionLike || emailProvider === "smtp",
      productionLike ? "smtp" : "non_launch_env_allows_console",
      "smtp_required_for_launch",
    ),
    check(
      "smtp_config",
      smtpShapeOk,
      emailProvider === "smtp" ? "configured" : "not_required_for_console_provider",
      "smtp_config_incomplete",
    ),
    check(
      "smtp_placeholder_values",
      smtpPlaceholderOk,
      emailProvider === "smtp" && productionLike ? "no_launch_placeholders_detected" : "not_required_for_non_launch_env",
      "placeholder_smtp_values_detected",
    ),
    check(
      "map_provider",
      !mapEnabled || allowedMapProviders.has(mapProvider),
      mapEnabled ? "configured" : "disabled",
      "map_provider_enabled_without_supported_provider",
    ),
    check(
      "map_budget",
      !mapEnabled || getPositiveInteger("MAP_MONTHLY_MAP_LOAD_LIMIT") > 0,
      mapEnabled ? "hard_limit_configured" : "disabled",
      "map_enabled_without_positive_monthly_limit",
    ),
    check(
      "map_public_token",
      !mapEnabled || env(mapTokenName).length > 0,
      mapEnabled ? "configured" : "disabled",
      "map_enabled_without_public_token",
    ),
    check("map_rate_limits", mapRateLimitsOk, mapEnabled ? "configured" : "disabled", "map_rate_limits_invalid"),
    check(
      "map_search_budget",
      !mapSearchEnabled || mapSearchLimit > 0,
      mapSearchEnabled ? "hard_limit_configured" : "disabled",
      "map_search_enabled_without_positive_monthly_limit",
    ),
    check(
      "map_search_token",
      !mapSearchEnabled || env(mapSearchTokenName).length > 0,
      mapSearchEnabled ? "configured" : "disabled",
      "map_search_enabled_without_server_token",
    ),
    check(
      "map_search_rate_limits",
      mapSearchRateLimitsOk,
      mapSearchEnabled ? "configured" : "disabled",
      "map_search_rate_limits_invalid",
    ),
    check("map_search_cache", mapSearchCacheOk, mapSearchEnabled ? "configured" : "disabled", "map_search_cache_ttl_invalid"),
    check(
      "staff_demo_expectations",
      staffDemoExpectationsOk,
      productionLike ? "configured" : "not_required_for_non_launch_env",
      "missing_real_staff_admin_expectation",
    ),
  ];
}

const checks = getChecks();
const payload = {
  ok: checks.every((item) => item.ok),
  generatedAt: new Date().toISOString(),
  target: {
    appEnv: env("APP_ENV") || "unset",
    nodeEnv: env("NODE_ENV") || "unset",
    productionLike: isProductionLike(),
  },
  checks,
};

console.log(JSON.stringify(payload, null, 2));

if (!payload.ok) {
  process.exitCode = 1;
}
