#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${QDOC_PUBLIC_URL:-}"
STRICT="${QDOC_SMOKE_STRICT:-false}"
PRIVATE_OUTPUT="${QDOC_SMOKE_PRIVATE_OUTPUT:-false}"

failures=0
warnings=0

log() {
  printf '==> %s\n' "$*"
}

is_true() {
  case "$1" in
    true | TRUE | 1 | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
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

status_value() {
  local name="$1"
  local default="${2:-pending}"
  local value="${!name:-$default}"

  case "$value" in
    passed | PASS | pass)
      printf 'passed'
      ;;
    pending | not_run | NOT_RUN | "")
      printf 'pending'
      ;;
    failed | FAIL | fail)
      printf 'failed'
      ;;
    *)
      printf 'invalid'
      ;;
  esac
}

validate_status() {
  local label="$1"
  local value="$2"

  case "$value" in
    passed)
      record_ok "$label is passed"
      ;;
    pending)
      if is_true "$STRICT"; then
        record_fail "$label is pending"
      else
        record_warn "$label is pending"
      fi
      ;;
    failed)
      record_fail "$label is failed"
      ;;
    invalid)
      record_fail "$label must be passed, pending, not_run, or failed"
      ;;
  esac
}

package_status() {
  local status
  local has_pending=false

  for status in "$@"; do
    case "$status" in
      failed | invalid)
        printf 'failed'
        return
        ;;
      pending)
        has_pending=true
        ;;
    esac
  done

  if is_true "$has_pending"; then
    printf 'pending'
  else
    printf 'passed'
  fi
}

validate_public_url() {
  if [ -z "$PUBLIC_URL" ]; then
    if is_true "$STRICT"; then
      record_fail "QDOC_PUBLIC_URL is missing"
    else
      record_warn "QDOC_PUBLIC_URL is missing"
    fi
    return
  fi

  if [[ "$PUBLIC_URL" =~ ^https://[^[:space:]]+$ ]]; then
    record_ok "QDOC_PUBLIC_URL format looks valid"
  else
    record_fail "QDOC_PUBLIC_URL must start with https://"
  fi
}

P5A_STAFF_ADMIN_DATA="$(status_value QDOC_SMOKE_STAFF_ADMIN_DATA)"
P5A_STAFF_ADMIN_SIGNIN="$(status_value QDOC_SMOKE_STAFF_ADMIN_SIGNIN)"
P5A_STAFF_TESTER_AUTH="$(status_value QDOC_SMOKE_STAFF_TESTER_AUTH)"
P5A_UNROSTERED_DENIAL="$(status_value QDOC_SMOKE_UNROSTERED_STAFF_DENIAL)"

P5B_PROVIDER_RESTRICTIONS="$(status_value QDOC_SMOKE_PROVIDER_RESTRICTIONS)"
P5B_MAP_GEO_CENTER="$(status_value QDOC_SMOKE_MAP_GEO_CENTER)"
P5B_MAP_PAN_ZOOM="$(status_value QDOC_SMOKE_MAP_PAN_ZOOM)"
P5B_MAP_RECENTER="$(status_value QDOC_SMOKE_MAP_RECENTER)"
P5B_MARKER_SYNC="$(status_value QDOC_SMOKE_MARKER_CARD_SYNC)"
P5B_MARKER_DISTINCTION="$(status_value QDOC_SMOKE_QDOC_PROVIDER_DISTINCTION)"
P5B_FAIL_CLOSED="$(status_value QDOC_SMOKE_MAP_FAIL_CLOSED)"

P5C_PATIENT_OTP_DELIVERY="$(status_value QDOC_SMOKE_PATIENT_OTP_DELIVERY)"
P5C_STAFF_OTP_DELIVERY="$(status_value QDOC_SMOKE_STAFF_OTP_DELIVERY)"
P5C_AUTH_ERROR_COPY="$(status_value QDOC_SMOKE_AUTH_ERROR_COPY)"
P5C_SESSION_REVISIT="$(status_value QDOC_SMOKE_SESSION_REVISIT)"

P5D_PATIENT_CHECKIN="$(status_value QDOC_SMOKE_PATIENT_CHECKIN)"
P5D_STAFF_QUEUE_OPS="$(status_value QDOC_SMOKE_STAFF_QUEUE_OPS)"
P5D_MEMBERSHIP_AUDIT="$(status_value QDOC_SMOKE_MEMBERSHIP_AUDIT)"
P5D_NOTIFICATION_OUTBOX="$(status_value QDOC_SMOKE_NOTIFICATION_OUTBOX)"
P5D_WORKER_DUPLICATE_GUARD="$(status_value QDOC_SMOKE_WORKER_DUPLICATE_GUARD)"

P5A_STATUS="$(package_status "$P5A_STAFF_ADMIN_DATA" "$P5A_STAFF_ADMIN_SIGNIN" "$P5A_STAFF_TESTER_AUTH" "$P5A_UNROSTERED_DENIAL")"
P5B_STATUS="$(package_status "$P5B_PROVIDER_RESTRICTIONS" "$P5B_MAP_GEO_CENTER" "$P5B_MAP_PAN_ZOOM" "$P5B_MAP_RECENTER" "$P5B_MARKER_SYNC" "$P5B_MARKER_DISTINCTION" "$P5B_FAIL_CLOSED")"
P5C_STATUS="$(package_status "$P5C_PATIENT_OTP_DELIVERY" "$P5C_STAFF_OTP_DELIVERY" "$P5C_AUTH_ERROR_COPY" "$P5C_SESSION_REVISIT")"
P5D_STATUS="$(package_status "$P5D_PATIENT_CHECKIN" "$P5D_STAFF_QUEUE_OPS" "$P5D_MEMBERSHIP_AUDIT" "$P5D_NOTIFICATION_OUTBOX" "$P5D_WORKER_DUPLICATE_GUARD")"
MANUAL_SMOKE_STATUS="$(package_status "$P5A_STATUS" "$P5B_STATUS" "$P5C_STATUS" "$P5D_STATUS")"

log "Checking portfolio smoke evidence inputs"
validate_public_url

log "Checking P5-A staff demo access"
validate_status "P5-A expected staff/admin admin-data verifier" "$P5A_STAFF_ADMIN_DATA"
validate_status "P5-A staff/admin OTP sign-in" "$P5A_STAFF_ADMIN_SIGNIN"
validate_status "P5-A authorized staff tester access" "$P5A_STAFF_TESTER_AUTH"
validate_status "P5-A unrostered staff denial" "$P5A_UNROSTERED_DENIAL"

log "Checking P5-B provider map public-browser evidence"
validate_status "P5-B provider restrictions and QDoc map/search budgets" "$P5B_PROVIDER_RESTRICTIONS"
validate_status "P5-B geolocation-centered map load" "$P5B_MAP_GEO_CENTER"
validate_status "P5-B pan/zoom controls" "$P5B_MAP_PAN_ZOOM"
validate_status "P5-B current-location recentering" "$P5B_MAP_RECENTER"
validate_status "P5-B marker/card synchronization" "$P5B_MARKER_SYNC"
validate_status "P5-B QDoc/provider marker distinction" "$P5B_MARKER_DISTINCTION"
validate_status "P5-B denied-location or over-budget fail-closed state" "$P5B_FAIL_CLOSED"

log "Checking P5-C OTP delivery and auth error evidence"
validate_status "P5-C patient first-time OTP delivery" "$P5C_PATIENT_OTP_DELIVERY"
validate_status "P5-C staff first-time OTP delivery" "$P5C_STAFF_OTP_DELIVERY"
validate_status "P5-C readable auth error copy" "$P5C_AUTH_ERROR_COPY"
validate_status "P5-C refresh/revisit session continuity" "$P5C_SESSION_REVISIT"

log "Checking P5-D public demo smoke evidence"
validate_status "P5-D patient check-in flow" "$P5D_PATIENT_CHECKIN"
validate_status "P5-D staff queue operations" "$P5D_STAFF_QUEUE_OPS"
validate_status "P5-D membership and audit-log review" "$P5D_MEMBERSHIP_AUDIT"
validate_status "P5-D almost-ready notification/outbox behavior" "$P5D_NOTIFICATION_OUTBOX"
validate_status "P5-D duplicate delivery prevention" "$P5D_WORKER_DUPLICATE_GUARD"

log "Safe portfolio smoke evidence block"
if ! is_true "$PRIVATE_OUTPUT"; then
  record_ok "Public URL is redacted from the generated block"
fi

cat <<EOF
Portfolio smoke public URL: $(redacted_public_url "$PUBLIC_URL")
P5-A Staff demo access: $P5A_STATUS
  Expected staff/admin admin-data verifier: $P5A_STAFF_ADMIN_DATA
  Staff/admin OTP sign-in: $P5A_STAFF_ADMIN_SIGNIN
  Authorized tester access: $P5A_STAFF_TESTER_AUTH
  Unrostered staff denial: $P5A_UNROSTERED_DENIAL
P5-B Provider map public-browser: $P5B_STATUS
  Provider restrictions and QDoc budgets: $P5B_PROVIDER_RESTRICTIONS
  Geolocation-centered map load: $P5B_MAP_GEO_CENTER
  Pan/zoom controls: $P5B_MAP_PAN_ZOOM
  Current-location recentering: $P5B_MAP_RECENTER
  Marker/card synchronization: $P5B_MARKER_SYNC
  QDoc/provider marker distinction: $P5B_MARKER_DISTINCTION
  Fail-closed provider/budget/permission states: $P5B_FAIL_CLOSED
P5-C OTP delivery and auth errors: $P5C_STATUS
  Patient first-time OTP delivery: $P5C_PATIENT_OTP_DELIVERY
  Staff first-time OTP delivery: $P5C_STAFF_OTP_DELIVERY
  Readable auth error copy: $P5C_AUTH_ERROR_COPY
  Refresh/revisit session continuity: $P5C_SESSION_REVISIT
P5-D Public demo smoke: $P5D_STATUS
  Patient check-in flow: $P5D_PATIENT_CHECKIN
  Staff queue operations: $P5D_STAFF_QUEUE_OPS
  Membership and audit-log review: $P5D_MEMBERSHIP_AUDIT
  Almost-ready notification/outbox behavior: $P5D_NOTIFICATION_OUTBOX
  Duplicate delivery prevention: $P5D_WORKER_DUPLICATE_GUARD
Manual smoke: $MANUAL_SMOKE_STATUS

Release evidence status exports:
QDOC_EVIDENCE_P5A_STATUS=$P5A_STATUS
QDOC_EVIDENCE_P5B_STATUS=$P5B_STATUS
QDOC_EVIDENCE_P5C_STATUS=$P5C_STATUS
QDOC_EVIDENCE_P5D_STATUS=$P5D_STATUS
QDOC_EVIDENCE_MANUAL_SMOKE_STATUS=$MANUAL_SMOKE_STATUS
EOF

if [ "$failures" -gt 0 ]; then
  printf 'ERROR: portfolio smoke evidence found %s blocking issue(s) and %s warning(s)\n' "$failures" "$warnings" >&2
  exit 1
fi

if [ "$warnings" -gt 0 ]; then
  printf 'Portfolio smoke evidence completed with %s warning(s); use QDOC_SMOKE_STRICT=true for final GO evidence.\n' "$warnings" >&2
else
  log "Portfolio smoke evidence passed"
fi
