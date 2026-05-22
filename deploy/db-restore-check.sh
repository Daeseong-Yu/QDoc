#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-}"
BACKUP_PATH="${1:-}"
CHECK_DB="${QDOC_RESTORE_CHECK_DB:-qdoc_restore_check}"

if [ -z "$ENV_FILE" ]; then
  if [ -f ".env.staging" ]; then
    ENV_FILE=".env.staging"
  else
    ENV_FILE="/opt/qdoc/shared/.env.staging"
  fi
fi

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

env_file_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | sed -E "s/^${key}=//; s/^\"(.*)\"$/\\1/"
}

[ -n "$BACKUP_PATH" ] || fail "Usage: $0 <backup.dump>"
[ -r "$BACKUP_PATH" ] || fail "Backup file is not readable: $BACKUP_PATH"
[[ "$CHECK_DB" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] || fail "QDOC_RESTORE_CHECK_DB must be a simple PostgreSQL identifier"

need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

POSTGRES_DB="$(env_file_value POSTGRES_DB || true)"
POSTGRES_USER="$(env_file_value POSTGRES_USER || true)"

[ -n "$POSTGRES_DB" ] || fail "POSTGRES_DB is required in $ENV_FILE"
[ -n "$POSTGRES_USER" ] || fail "POSTGRES_USER is required in $ENV_FILE"

case "$CHECK_DB" in
  "$POSTGRES_DB"|postgres|template0|template1)
    fail "QDOC_RESTORE_CHECK_DB must not target the primary or reserved database: $CHECK_DB"
    ;;
esac

cleanup() {
  compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" "$CHECK_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$CHECK_DB"
compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$CHECK_DB" \
  --exit-on-error \
  --no-owner \
  --no-privileges < "$BACKUP_PATH"

printf 'Restore check passed for %s\n' "$CHECK_DB"
