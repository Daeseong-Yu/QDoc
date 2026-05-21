#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-.env.staging}"
BACKUP_PATH="${1:-}"

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
[ "${QDOC_RESTORE_CONFIRM:-}" = "restore-qdoc" ] || fail "Set QDOC_RESTORE_CONFIRM=restore-qdoc to restore the primary database"

need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

POSTGRES_DB="$(env_file_value POSTGRES_DB || true)"
POSTGRES_USER="$(env_file_value POSTGRES_USER || true)"

[ -n "$POSTGRES_DB" ] || fail "POSTGRES_DB is required in $ENV_FILE"
[ -n "$POSTGRES_USER" ] || fail "POSTGRES_USER is required in $ENV_FILE"

compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges < "$BACKUP_PATH"
