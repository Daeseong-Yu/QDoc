#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-.env.staging}"
PUBLIC_URL="${QDOC_PUBLIC_URL:-}"
BACKUP_DIR="${QDOC_BACKUP_DIR:-backups}"
EXPECTED_SOURCE_REF="${QDOC_EXPECTED_SOURCE_REF:-}"
EXPECTED_APP_IMAGE="${QDOC_EXPECTED_APP_IMAGE:-}"
DRY_RUN="${QDOC_REHEARSAL_DRY_RUN:-false}"
REQUIRE_PUBLIC_URL="${QDOC_REHEARSAL_REQUIRE_PUBLIC_URL:-true}"
RUN_BACKUP="${QDOC_REHEARSAL_BACKUP:-false}"

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

check_expected_source_ref() {
  local current_ref

  [ -z "$EXPECTED_SOURCE_REF" ] && return 0
  [[ "$EXPECTED_SOURCE_REF" =~ ^[0-9a-fA-F]{40}$ ]] || fail "QDOC_EXPECTED_SOURCE_REF must be a 40-character Git SHA"

  need_command git
  current_ref="$(git rev-parse --verify HEAD)"
  [ "$current_ref" = "$EXPECTED_SOURCE_REF" ] || fail "Checkout SHA mismatch: expected $EXPECTED_SOURCE_REF, got $current_ref"
}

check_expected_app_image() {
  local configured_image

  [ -z "$EXPECTED_APP_IMAGE" ] && return 0

  configured_image="${QDOC_APP_IMAGE:-}"
  if [ -z "$configured_image" ]; then
    configured_image="$(env_file_value QDOC_APP_IMAGE || true)"
  fi

  [ -n "$configured_image" ] || fail "QDOC_APP_IMAGE is required when QDOC_EXPECTED_APP_IMAGE is set"
  [ "$configured_image" = "$EXPECTED_APP_IMAGE" ] || fail "QDOC_APP_IMAGE mismatch: expected $EXPECTED_APP_IMAGE, got $configured_image"
}

print_dry_run() {
  log "Dry run passed preflight checks"
  printf 'Would run: QDOC_PUBLIC_URL=%q QDOC_VERIFY_OUTBOX=true QDOC_VERIFY_OPS=true QDOC_VERIFY_LAUNCH=true QDOC_COMPOSE_FILE=%q QDOC_ENV_FILE=%q bash deploy/verify-staging.sh\n' "$PUBLIC_URL" "$COMPOSE_FILE" "$ENV_FILE"

  if is_true "$RUN_BACKUP"; then
    printf 'Would run: QDOC_BACKUP_DIR=%q QDOC_COMPOSE_FILE=%q QDOC_ENV_FILE=%q bash deploy/db-backup.sh\n' "$BACKUP_DIR" "$COMPOSE_FILE" "$ENV_FILE"
    printf 'Would run: QDOC_COMPOSE_FILE=%q QDOC_ENV_FILE=%q bash deploy/db-restore-check.sh <backup-path>\n' "$COMPOSE_FILE" "$ENV_FILE"
  else
    log "Would skip backup restore-check; set QDOC_REHEARSAL_BACKUP=true to include it"
  fi
}

need_command docker

[ -f "$COMPOSE_FILE" ] || fail "Compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "Environment file not found: $ENV_FILE"

if is_true "$REQUIRE_PUBLIC_URL" && [ -z "$PUBLIC_URL" ]; then
  fail "QDOC_PUBLIC_URL is required for staging rehearsal; set QDOC_REHEARSAL_REQUIRE_PUBLIC_URL=false only for local dry-run verification"
fi

log "Checking release identity"
check_expected_source_ref
check_expected_app_image

log "Checking Compose configuration"
compose config --quiet

if is_true "$DRY_RUN"; then
  print_dry_run
  exit 0
fi

log "Running full staging verifier"
QDOC_COMPOSE_FILE="$COMPOSE_FILE" \
  QDOC_ENV_FILE="$ENV_FILE" \
  QDOC_PUBLIC_URL="$PUBLIC_URL" \
  QDOC_VERIFY_OUTBOX=true \
  QDOC_VERIFY_OPS=true \
  QDOC_VERIFY_LAUNCH=true \
  bash deploy/verify-staging.sh

if is_true "$RUN_BACKUP"; then
  log "Creating staging database backup"
  backup_output="$(
    QDOC_COMPOSE_FILE="$COMPOSE_FILE" \
      QDOC_ENV_FILE="$ENV_FILE" \
      QDOC_BACKUP_DIR="$BACKUP_DIR" \
      bash deploy/db-backup.sh
  )"
  backup_path="$(printf '%s\n' "$backup_output" | tail -n 1)"

  [ -n "$backup_path" ] || fail "Backup script did not return a backup path"

  log "Running temporary restore-check"
  QDOC_COMPOSE_FILE="$COMPOSE_FILE" \
    QDOC_ENV_FILE="$ENV_FILE" \
    bash deploy/db-restore-check.sh "$backup_path"
else
  log "Skipping backup restore-check; set QDOC_REHEARSAL_BACKUP=true to include it"
fi

log "Staging rehearsal passed"
