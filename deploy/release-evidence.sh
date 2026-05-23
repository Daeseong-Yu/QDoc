#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${QDOC_ENV_FILE:-}"
PUBLIC_URL="${QDOC_PUBLIC_URL:-}"
CANDIDATE_SHA="${QDOC_RELEASE_SHA:-${QDOC_EXPECTED_RELEASE_SHA:-}}"
IMAGE_NAME="${QDOC_IMAGE_NAME:-qdoc-app}"
EXPECTED_APP_IMAGE="${QDOC_EXPECTED_APP_IMAGE:-${QDOC_APP_IMAGE:-}}"
APP_ARTIFACT_URI="${QDOC_APP_ARTIFACT_URI:-}"
OPS_BUNDLE_URI="${QDOC_OPS_BUNDLE_URI:-}"
APP_ARTIFACT_SHA256="${QDOC_APP_ARTIFACT_SHA256:-}"
OPS_BUNDLE_SHA256="${QDOC_OPS_BUNDLE_SHA256:-}"
SSM_COMMAND_ID="${QDOC_SSM_COMMAND_ID:-}"
BACKUP_PATH="${QDOC_BACKUP_PATH:-}"
ROLLBACK_SHA="${QDOC_ROLLBACK_SHA:-}"
ROLLBACK_APP_ARTIFACT_URI="${QDOC_ROLLBACK_APP_ARTIFACT_URI:-}"
ROLLBACK_OPS_BUNDLE_URI="${QDOC_ROLLBACK_OPS_BUNDLE_URI:-}"
ROLLBACK_BACKUP_PATH="${QDOC_ROLLBACK_BACKUP_PATH:-}"
STRICT="${QDOC_EVIDENCE_STRICT:-false}"
PRIVATE_OUTPUT="${QDOC_EVIDENCE_PRIVATE_OUTPUT:-false}"

LOCAL_CHECKS_STATUS="${QDOC_EVIDENCE_LOCAL_CHECKS_STATUS:-pending}"
STAGING_VERIFIER_STATUS="${QDOC_EVIDENCE_STAGING_VERIFIER_STATUS:-pending}"
STAGING_REHEARSAL_STATUS="${QDOC_EVIDENCE_STAGING_REHEARSAL_STATUS:-pending}"
BACKUP_RESTORE_CHECK_STATUS="${QDOC_EVIDENCE_BACKUP_RESTORE_CHECK_STATUS:-pending}"
MANUAL_SMOKE_STATUS="${QDOC_EVIDENCE_MANUAL_SMOKE_STATUS:-pending}"
P5A_STATUS="${QDOC_EVIDENCE_P5A_STATUS:-pending}"
P5B_STATUS="${QDOC_EVIDENCE_P5B_STATUS:-pending}"
P5C_STATUS="${QDOC_EVIDENCE_P5C_STATUS:-pending}"
P5D_STATUS="${QDOC_EVIDENCE_P5D_STATUS:-pending}"
P5E_STATUS="${QDOC_EVIDENCE_P5E_STATUS:-pending}"
DECISION="${QDOC_GO_NO_GO_DECISION:-NO-GO}"
OPERATOR="${QDOC_RELEASE_OPERATOR:-}"
KNOWN_RISKS="${QDOC_KNOWN_RISKS:-}"

failures=0
warnings=0

if [ -z "$ENV_FILE" ]; then
  if [ -f ".env.staging" ]; then
    ENV_FILE=".env.staging"
  elif [ -f "/opt/qdoc/shared/.env.staging" ]; then
    ENV_FILE="/opt/qdoc/shared/.env.staging"
  fi
fi

log() {
  printf '==> %s\n' "$*"
}

is_true() {
  case "$1" in
    true | TRUE | 1 | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

has_placeholder_value() {
  case "$1" in
    *replace-with* | *REPLACE-WITH* | *change-me* | *CHANGE-ME* | *example* | *EXAMPLE*) return 0 ;;
    *) return 1 ;;
  esac
}

env_file_value() {
  local key="$1"
  local line value

  [ -n "$ENV_FILE" ] || return 1
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

record_ok() {
  printf 'OK: %s\n' "$*"
}

record_warn() {
  warnings=$((warnings + 1))
  printf 'WARN: %s\n' "$*" >&2
}

record_fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

required_value() {
  local label="$1"
  local value="$2"

  if [ -z "$value" ]; then
    record_fail "$label is missing"
    return 1
  fi

  record_ok "$label is set"
}

validate_pattern() {
  local label="$1"
  local value="$2"
  local pattern="$3"
  local message="$4"

  [ -z "$value" ] && return 0

  if [[ "$value" =~ $pattern ]]; then
    record_ok "$label format looks valid"
  else
    record_fail "$label $message"
  fi
}

validate_status() {
  local label="$1"
  local value="$2"

  case "$value" in
    passed | PASS | pass)
      record_ok "$label is passed"
      ;;
    pending | not_run | NOT_RUN)
      if is_true "$STRICT"; then
        record_fail "$label is $value"
      else
        record_warn "$label is $value"
      fi
      ;;
    failed | FAIL | fail)
      record_fail "$label is failed"
      ;;
    *)
      record_fail "$label must be passed, pending, not_run, or failed"
      ;;
  esac
}

evidence_value() {
  local value="$1"

  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '<pending>'
  fi
}

redacted_value() {
  local value="$1"

  if [ -z "$value" ]; then
    printf '<pending>'
  elif is_true "$PRIVATE_OUTPUT"; then
    printf '%s' "$value"
  else
    printf '<redacted; validated>'
  fi
}

redacted_s3_uri() {
  local value="$1"
  local sha="$2"
  local name="$3"

  if [ -z "$value" ]; then
    printf '<pending>'
  elif is_true "$PRIVATE_OUTPUT"; then
    printf '%s' "$value"
  elif [ -n "$sha" ]; then
    printf 's3://<private-bucket>/staging/%s/%s' "$sha" "$name"
  else
    printf 's3://<private-bucket>/staging/<sha>/%s' "$name"
  fi
}

redacted_public_url() {
  local value="$1"

  if [ -z "$value" ]; then
    printf '<pending>'
  elif is_true "$PRIVATE_OUTPUT"; then
    printf '%s' "$value"
  else
    printf 'https://<public-domain>'
  fi
}

redacted_path() {
  local value="$1"

  if [ -z "$value" ]; then
    printf '<pending>'
  elif is_true "$PRIVATE_OUTPUT"; then
    printf '%s' "$value"
  else
    printf '<private-backup-path>'
  fi
}

if [ -z "$EXPECTED_APP_IMAGE" ]; then
  env_app_image="$(env_file_value QDOC_APP_IMAGE || true)"
  if [ -n "$env_app_image" ] && ! has_placeholder_value "$env_app_image"; then
    EXPECTED_APP_IMAGE="$env_app_image"
  elif [ -n "$env_app_image" ] && has_placeholder_value "$env_app_image"; then
    record_fail "Docker image tag is not supplied; $ENV_FILE still contains placeholder QDOC_APP_IMAGE, so set QDOC_EXPECTED_APP_IMAGE=${IMAGE_NAME}:<40-character-git-sha> for release evidence"
  fi
fi

log "Checking release evidence inputs"

required_value "Candidate Git SHA" "$CANDIDATE_SHA" || true
required_value "Docker image tag" "$EXPECTED_APP_IMAGE" || true
required_value "S3 app artifact URI" "$APP_ARTIFACT_URI" || true
required_value "S3 ops bundle URI" "$OPS_BUNDLE_URI" || true
required_value "App artifact SHA-256" "$APP_ARTIFACT_SHA256" || true
required_value "Ops bundle SHA-256" "$OPS_BUNDLE_SHA256" || true
required_value "Staging public URL" "$PUBLIC_URL" || true
required_value "SSM command ID" "$SSM_COMMAND_ID" || true
required_value "Backup path" "$BACKUP_PATH" || true
required_value "Rollback target SHA" "$ROLLBACK_SHA" || true
required_value "Rollback app artifact URI" "$ROLLBACK_APP_ARTIFACT_URI" || true
required_value "Rollback ops bundle URI" "$ROLLBACK_OPS_BUNDLE_URI" || true
required_value "Rollback backup path" "$ROLLBACK_BACKUP_PATH" || true

validate_pattern "Candidate Git SHA" "$CANDIDATE_SHA" '^[0-9a-fA-F]{40}$' "must be a 40-character Git SHA"
validate_pattern "Rollback target SHA" "$ROLLBACK_SHA" '^[0-9a-fA-F]{40}$' "must be a 40-character Git SHA"
validate_pattern "App artifact SHA-256" "$APP_ARTIFACT_SHA256" '^[0-9a-fA-F]{64}$' "must be a 64-character SHA-256"
validate_pattern "Ops bundle SHA-256" "$OPS_BUNDLE_SHA256" '^[0-9a-fA-F]{64}$' "must be a 64-character SHA-256"
validate_pattern "Staging public URL" "$PUBLIC_URL" '^https://[^[:space:]]+$' "must start with https://"

if [ -n "$CANDIDATE_SHA" ] && [ -n "$EXPECTED_APP_IMAGE" ]; then
  if [ "$EXPECTED_APP_IMAGE" = "${IMAGE_NAME}:${CANDIDATE_SHA}" ]; then
    record_ok "Docker image tag matches candidate SHA"
  else
    record_fail "Docker image tag should be ${IMAGE_NAME}:${CANDIDATE_SHA}, got $EXPECTED_APP_IMAGE"
  fi
fi

if [ -n "$CANDIDATE_SHA" ] && [ -n "$APP_ARTIFACT_URI" ]; then
  validate_pattern "S3 app artifact URI" "$APP_ARTIFACT_URI" "^s3://[^[:space:]]+/staging/${CANDIDATE_SHA}/qdoc-app\\.tar\\.gz$" "must point to staging/$CANDIDATE_SHA/qdoc-app.tar.gz"
fi

if [ -n "$CANDIDATE_SHA" ] && [ -n "$OPS_BUNDLE_URI" ]; then
  validate_pattern "S3 ops bundle URI" "$OPS_BUNDLE_URI" "^s3://[^[:space:]]+/staging/${CANDIDATE_SHA}/qdoc-ops\\.tar\\.gz$" "must point to staging/$CANDIDATE_SHA/qdoc-ops.tar.gz"
fi

if [ -n "$ROLLBACK_SHA" ] && [ -n "$ROLLBACK_APP_ARTIFACT_URI" ]; then
  validate_pattern "Rollback app artifact URI" "$ROLLBACK_APP_ARTIFACT_URI" "^s3://[^[:space:]]+/staging/${ROLLBACK_SHA}/qdoc-app\\.tar\\.gz$" "must point to staging/$ROLLBACK_SHA/qdoc-app.tar.gz"
fi

if [ -n "$ROLLBACK_SHA" ] && [ -n "$ROLLBACK_OPS_BUNDLE_URI" ]; then
  validate_pattern "Rollback ops bundle URI" "$ROLLBACK_OPS_BUNDLE_URI" "^s3://[^[:space:]]+/staging/${ROLLBACK_SHA}/qdoc-ops\\.tar\\.gz$" "must point to staging/$ROLLBACK_SHA/qdoc-ops.tar.gz"
fi

log "Checking package and evidence statuses"
validate_status "P5-A Staff demo access" "$P5A_STATUS"
validate_status "P5-B Provider map public-browser" "$P5B_STATUS"
validate_status "P5-C OTP delivery and auth errors" "$P5C_STATUS"
validate_status "P5-D Public demo smoke" "$P5D_STATUS"
validate_status "P5-E Operations evidence" "$P5E_STATUS"
validate_status "Local checks" "$LOCAL_CHECKS_STATUS"
validate_status "Staging verifier" "$STAGING_VERIFIER_STATUS"
validate_status "Staging rehearsal" "$STAGING_REHEARSAL_STATUS"
validate_status "Backup restore-check" "$BACKUP_RESTORE_CHECK_STATUS"
validate_status "Manual smoke" "$MANUAL_SMOKE_STATUS"

case "$DECISION" in
  GO | NO-GO) ;;
  *)
    record_fail "QDOC_GO_NO_GO_DECISION must be GO or NO-GO"
    ;;
esac

log "Safe decision record block"
if ! is_true "$PRIVATE_OUTPUT"; then
  record_ok "Private operational identifiers will be redacted from the generated block"
fi

cat <<EOF
Decision: $DECISION
Candidate SHA: $(evidence_value "$CANDIDATE_SHA")
App artifact URI: $(redacted_s3_uri "$APP_ARTIFACT_URI" "$CANDIDATE_SHA" "qdoc-app.tar.gz")
Ops bundle URI: $(redacted_s3_uri "$OPS_BUNDLE_URI" "$CANDIDATE_SHA" "qdoc-ops.tar.gz")
App artifact SHA-256: $(evidence_value "$APP_ARTIFACT_SHA256")
Ops bundle SHA-256: $(evidence_value "$OPS_BUNDLE_SHA256")
Staging URL: $(redacted_public_url "$PUBLIC_URL")
P5-A Staff demo access: $P5A_STATUS
P5-B Provider map public-browser: $P5B_STATUS
P5-C OTP delivery and auth errors: $P5C_STATUS
P5-D Public demo smoke: $P5D_STATUS
P5-E Operations evidence: $P5E_STATUS
Local checks: $LOCAL_CHECKS_STATUS
Staging verifier: $STAGING_VERIFIER_STATUS
Staging rehearsal: $STAGING_REHEARSAL_STATUS
Backup restore-check: $BACKUP_RESTORE_CHECK_STATUS
Manual smoke: $MANUAL_SMOKE_STATUS
SSM command ID: $(redacted_value "$SSM_COMMAND_ID")
Backup path: $(redacted_path "$BACKUP_PATH")
Known risks: $(redacted_value "$KNOWN_RISKS")
Rollback target: $(evidence_value "$ROLLBACK_SHA")
Rollback app artifact URI: $(redacted_s3_uri "$ROLLBACK_APP_ARTIFACT_URI" "$ROLLBACK_SHA" "qdoc-app.tar.gz")
Rollback ops bundle URI: $(redacted_s3_uri "$ROLLBACK_OPS_BUNDLE_URI" "$ROLLBACK_SHA" "qdoc-ops.tar.gz")
Rollback backup path: $(redacted_path "$ROLLBACK_BACKUP_PATH")
Operator: $(redacted_value "$OPERATOR")
Decision time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF

if [ "$failures" -gt 0 ]; then
  printf 'ERROR: release evidence preflight found %s blocking issue(s) and %s warning(s)\n' "$failures" "$warnings" >&2
  exit 1
fi

if [ "$warnings" -gt 0 ]; then
  printf 'Release evidence preflight completed with %s warning(s); use QDOC_EVIDENCE_STRICT=true for final GO evidence.\n' "$warnings" >&2
else
  log "Release evidence preflight passed"
fi
