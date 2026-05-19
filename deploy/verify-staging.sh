#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-.env.staging}"
RUN_OUTBOX="${QDOC_VERIFY_OUTBOX:-false}"

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

if [ -n "${QDOC_WEB_PORT+x}" ]; then
  WEB_PORT="$QDOC_WEB_PORT"
else
  WEB_PORT="$(env_file_value QDOC_WEB_PORT || true)"
  WEB_PORT="${WEB_PORT:-13000}"
fi

WEB_URL="${QDOC_WEB_URL:-http://127.0.0.1:${WEB_PORT}}"
PUBLIC_URL="${QDOC_PUBLIC_URL:-}"

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

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

need_command curl
need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

log "Checking staging service containers"
for service in web api worker postgres redis; do
  container_id="$(compose ps -q "$service")"
  [ -n "$container_id" ] || fail "Service has no container: $service"

  state="$(docker inspect -f '{{.State.Status}}' "$container_id")"
  [ "$state" = "running" ] || fail "Service is not running: $service ($state)"

  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  case "$service" in
    web | api | postgres | redis)
      [ "$health" = "healthy" ] || fail "Service is not healthy: $service ($health)"
      ;;
  esac
done

log "Checking local web endpoint: $WEB_URL"
curl -fsSI "$WEB_URL" >/dev/null

log "Checking API health inside the compose network"
compose exec -T api wget -qO- http://127.0.0.1:4000/health >/dev/null

if [ -n "$PUBLIC_URL" ]; then
  log "Checking public Caddy route: $PUBLIC_URL"
  curl -fsSI "$PUBLIC_URL" >/dev/null
else
  log "Skipping public Caddy route check; set QDOC_PUBLIC_URL to enable it"
fi

if [ "$RUN_OUTBOX" = "true" ]; then
  log "Running outbox processor verification in the staging image"
  compose run --rm --no-deps worker pnpm verify:outbox
else
  log "Skipping outbox verification; set QDOC_VERIFY_OUTBOX=true to enable it"
fi

log "Staging verification passed"
