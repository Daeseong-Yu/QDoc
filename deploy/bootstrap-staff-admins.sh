#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-}"

if [ -z "$ENV_FILE" ]; then
  if [ -f ".env.staging" ]; then
    ENV_FILE=".env.staging"
  else
    ENV_FILE="/opt/qdoc/shared/.env.staging"
  fi
fi

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

need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

if [ -z "${QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS:-}" ]; then
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$(env_file_value QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS || true)"
fi

if [ -z "${QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS:-}" ]; then
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$(env_file_value QDOC_SEED_STAFF_ADMIN_EMAILS || true)"
fi

[ -n "${QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS:-}" ] || fail "QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS is required"

if [ -z "${QDOC_BOOTSTRAP_STAFF_SITE_IDS:-}" ]; then
  QDOC_BOOTSTRAP_STAFF_SITE_IDS="$(env_file_value QDOC_BOOTSTRAP_STAFF_SITE_IDS || true)"
fi

if [ -z "${QDOC_BOOTSTRAP_STAFF_SITE_IDS:-}" ]; then
  QDOC_BOOTSTRAP_STAFF_SITE_IDS="$(env_file_value QDOC_ADMIN_DATA_EXPECT_SITE_IDS || true)"
fi

export QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS
export QDOC_BOOTSTRAP_STAFF_SITE_IDS
export QDOC_BOOTSTRAP_STAFF_DRY_RUN="${QDOC_BOOTSTRAP_STAFF_DRY_RUN:-false}"

log "Bootstrapping staff admin memberships in the staging image"
compose run --rm --no-deps \
  -e QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS \
  -e QDOC_BOOTSTRAP_STAFF_SITE_IDS \
  -e QDOC_BOOTSTRAP_STAFF_DRY_RUN \
  worker pnpm db:bootstrap-staff-admins:staging

log "Staff admin bootstrap finished"
