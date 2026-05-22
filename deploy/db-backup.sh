#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-}"
BACKUP_DIR="${QDOC_BACKUP_DIR:-backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

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

need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

POSTGRES_DB="$(env_file_value POSTGRES_DB || true)"
POSTGRES_USER="$(env_file_value POSTGRES_USER || true)"

[ -n "$POSTGRES_DB" ] || fail "POSTGRES_DB is required in $ENV_FILE"
[ -n "$POSTGRES_USER" ] || fail "POSTGRES_USER is required in $ENV_FILE"

umask 077
mkdir -p "$BACKUP_DIR"

BACKUP_PATH="${QDOC_BACKUP_PATH:-${BACKUP_DIR}/qdoc-${POSTGRES_DB}-${TIMESTAMP}.dump}"
case "$BACKUP_PATH" in
  /*) ;;
  *) BACKUP_PATH="$(pwd)/$BACKUP_PATH" ;;
esac

[ ! -e "$BACKUP_PATH" ] || fail "Backup path already exists: $BACKUP_PATH"

TMP_PATH="${BACKUP_PATH}.tmp"
cleanup() {
  rm -f "$TMP_PATH"
}
trap cleanup EXIT

compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges > "$TMP_PATH"

mv "$TMP_PATH" "$BACKUP_PATH"
printf '%s\n' "$BACKUP_PATH"
