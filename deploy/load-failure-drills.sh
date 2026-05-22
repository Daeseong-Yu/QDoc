#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-.env.staging}"
DRY_RUN="${QDOC_DRILL_DRY_RUN:-false}"
REQUESTS="${QDOC_DRILL_REQUESTS:-12}"
TIMEOUT_SECONDS="${QDOC_DRILL_TIMEOUT_SECONDS:-5}"
PUBLIC_URL="${QDOC_PUBLIC_URL:-}"
RUN_OUTBOX="${QDOC_DRILL_VERIFY_OUTBOX:-true}"
RUN_OPS="${QDOC_DRILL_VERIFY_OPS:-true}"
RUN_ADMIN_DATA="${QDOC_DRILL_VERIFY_ADMIN_DATA:-true}"
RUN_LAUNCH="${QDOC_DRILL_VERIFY_LAUNCH:-true}"

MAX_REQUESTS=60
MAX_TIMEOUT_SECONDS=30

log() {
  printf '==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

is_true() {
  case "$1" in
    true | TRUE | 1 | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

positive_int() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
    0) return 1 ;;
    *) return 0 ;;
  esac
}

env_file_value() {
  local key="$1"
  local line value

  [ -f "$ENV_FILE" ] || return 1

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#export }"
    case "$line" in
      "$key="*)
        value="${line#*=}"
        value="${value%$'\r'}"
        case "$value" in
          \"*\")
            value="${value#\"}"
            value="${value%\"}"
            ;;
          \'*\')
            value="${value#\'}"
            value="${value%\'}"
            ;;
        esac
        printf '%s' "$value"
        return 0
        ;;
    esac
  done < "$ENV_FILE"

  return 1
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

check_bounds() {
  positive_int "$REQUESTS" || fail "QDOC_DRILL_REQUESTS must be a positive integer"
  positive_int "$TIMEOUT_SECONDS" || fail "QDOC_DRILL_TIMEOUT_SECONDS must be a positive integer"
  [ "$REQUESTS" -le "$MAX_REQUESTS" ] || fail "QDOC_DRILL_REQUESTS must be <= $MAX_REQUESTS"
  [ "$TIMEOUT_SECONDS" -le "$MAX_TIMEOUT_SECONDS" ] || fail "QDOC_DRILL_TIMEOUT_SECONDS must be <= $MAX_TIMEOUT_SECONDS"
}

http_probe_loop() {
  local name="$1"
  local url="$2"
  local current=1

  log "Running bounded HTTP drill: $name ($REQUESTS requests)"
  while [ "$current" -le "$REQUESTS" ]; do
    curl -fsS --max-time "$TIMEOUT_SECONDS" -o /dev/null "$url"
    current=$((current + 1))
  done
}

api_probe_loop() {
  local name="$1"
  local path="$2"
  local current=1

  log "Running bounded private API drill: $name ($REQUESTS requests)"
  while [ "$current" -le "$REQUESTS" ]; do
    compose exec -T api wget -qO- "http://127.0.0.1:4000${path}" >/dev/null
    current=$((current + 1))
  done
}

print_dry_run() {
  log "Dry run passed preflight checks"
  printf 'Would run %s bounded requests each against local web, API /health, API /ready, API /sites, and optional public URL.\n' "$REQUESTS"
  printf 'Would run worker verifiers: outbox=%s ops=%s admin-data=%s launch=%s.\n' "$RUN_OUTBOX" "$RUN_OPS" "$RUN_ADMIN_DATA" "$RUN_LAUNCH"
  printf 'Compose file: %s\nEnvironment file: %s\n' "$COMPOSE_FILE" "$ENV_FILE"
}

check_bounds

if [ -n "${QDOC_WEB_PORT+x}" ]; then
  WEB_PORT="$QDOC_WEB_PORT"
else
  WEB_PORT="$(env_file_value QDOC_WEB_PORT || true)"
  WEB_PORT="${WEB_PORT:-13000}"
fi

WEB_URL="${QDOC_WEB_URL:-http://127.0.0.1:${WEB_PORT}}"

if is_true "$DRY_RUN"; then
  print_dry_run
  exit 0
fi

need_command curl
need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

log "Checking Compose service state before drills"
compose ps web api worker postgres redis >/dev/null

http_probe_loop "web home" "$WEB_URL"
api_probe_loop "api health" "/health"
api_probe_loop "api readiness" "/ready"
api_probe_loop "patient site list" "/sites"

if [ -n "$PUBLIC_URL" ]; then
  http_probe_loop "public Caddy route" "$PUBLIC_URL"
else
  log "Skipping public Caddy route drill; set QDOC_PUBLIC_URL to enable it"
fi

if is_true "$RUN_OUTBOX"; then
  log "Running scoped outbox success/retry/failure drill"
  compose run --rm --no-deps worker pnpm verify:outbox
else
  log "Skipping outbox drill; set QDOC_DRILL_VERIFY_OUTBOX=true to enable it"
fi

if is_true "$RUN_OPS"; then
  log "Checking operational signals after load drills"
  compose run --rm --no-deps worker pnpm verify:ops
else
  log "Skipping operational signal check; set QDOC_DRILL_VERIFY_OPS=true to enable it"
fi

if is_true "$RUN_ADMIN_DATA"; then
  log "Checking admin data readiness after load drills"
  compose run --rm --no-deps worker pnpm verify:admin-data
else
  log "Skipping admin data readiness check; set QDOC_DRILL_VERIFY_ADMIN_DATA=true to enable it"
fi

if is_true "$RUN_LAUNCH"; then
  log "Checking launch hardening and fail-closed settings"
  compose run --rm --no-deps worker pnpm verify:launch
else
  log "Skipping launch hardening check; set QDOC_DRILL_VERIFY_LAUNCH=true to enable it"
fi

log "Load and failure drills passed"
