#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO_SMOKE_EVIDENCE="$SCRIPT_DIR/portfolio-smoke-evidence.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BASE_ENV=(
  "QDOC_PUBLIC_URL=https://qdoc.example.com"
)

case_stdout() {
  local name="$1"
  printf '%s/%s.out' "$TMP_DIR" "$name"
}

case_stderr() {
  local name="$1"
  printf '%s/%s.err' "$TMP_DIR" "$name"
}

run_case() {
  local name="$1"
  local expected_status="$2"
  local status
  shift 2

  set +e
  env "${BASE_ENV[@]}" "$@" bash "$PORTFOLIO_SMOKE_EVIDENCE" >"$(case_stdout "$name")" 2>"$(case_stderr "$name")"
  status=$?
  set -e

  if [ "$status" -ne "$expected_status" ]; then
    printf 'FAIL: %s exited with %s; expected %s\n' "$name" "$status" "$expected_status" >&2
    printf '%s\n' "--- stdout: $name ---" >&2
    sed -n '1,240p' "$(case_stdout "$name")" >&2
    printf '%s\n' "--- stderr: $name ---" >&2
    sed -n '1,240p' "$(case_stderr "$name")" >&2
    exit 1
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if ! grep -Eq -- "$pattern" "$file"; then
    printf 'FAIL: expected %s to contain %s\n' "$label" "$pattern" >&2
    sed -n '1,240p' "$file" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if grep -Eq -- "$pattern" "$file"; then
    printf 'FAIL: expected %s not to contain %s\n' "$label" "$pattern" >&2
    sed -n '1,240p' "$file" >&2
    exit 1
  fi
}

P5A_PASSED_STATUSES=(
  "QDOC_SMOKE_STAFF_ADMIN_DATA=passed"
  "QDOC_SMOKE_STAFF_ADMIN_SIGNIN=passed"
  "QDOC_SMOKE_STAFF_TESTER_AUTH=passed"
  "QDOC_SMOKE_STAFF_TESTER_MEMBERSHIP=passed"
  "QDOC_SMOKE_STAFF_ROLE_BOUNDARY=passed"
  "QDOC_SMOKE_UNROSTERED_STAFF_DENIAL=passed"
)

ALL_PASSED_STATUSES=(
  "QDOC_SMOKE_PUBLIC_RELEASE_PREFLIGHT=passed"
  "QDOC_SMOKE_PUBLIC_BROWSER_SMOKE=passed"
  "${P5A_PASSED_STATUSES[@]}"
  "QDOC_SMOKE_PROVIDER_RESTRICTIONS=passed"
  "QDOC_SMOKE_MAP_GEO_CENTER=passed"
  "QDOC_SMOKE_MAP_PAN_ZOOM=passed"
  "QDOC_SMOKE_MAP_RECENTER=passed"
  "QDOC_SMOKE_MARKER_CARD_SYNC=passed"
  "QDOC_SMOKE_QDOC_PROVIDER_DISTINCTION=passed"
  "QDOC_SMOKE_MAP_FAIL_CLOSED=passed"
  "QDOC_SMOKE_PATIENT_OTP_DELIVERY=passed"
  "QDOC_SMOKE_STAFF_OTP_DELIVERY=passed"
  "QDOC_SMOKE_AUTH_ERROR_COPY=passed"
  "QDOC_SMOKE_SESSION_REVISIT=passed"
  "QDOC_SMOKE_PATIENT_CHECKIN=passed"
  "QDOC_SMOKE_PATIENT_STATUS_REVISIT=passed"
  "QDOC_SMOKE_STAFF_QUEUE_OPS=passed"
  "QDOC_SMOKE_STAFF_QUEUE_CONTROLS=passed"
  "QDOC_SMOKE_MEMBERSHIP_AUDIT=passed"
  "QDOC_SMOKE_AUDIT_LOG_REVIEW=passed"
  "QDOC_SMOKE_NOTIFICATION_OUTBOX=passed"
  "QDOC_SMOKE_WORKER_DUPLICATE_GUARD=passed"
)

run_case "pending_non_strict_warns" 0
assert_contains "$(case_stdout "pending_non_strict_warns")" '^Portfolio smoke public URL: https://<public-domain>$' "pending smoke stdout"
assert_contains "$(case_stdout "pending_non_strict_warns")" '^P5-A Staff demo access: pending$' "pending smoke stdout"
assert_contains "$(case_stdout "pending_non_strict_warns")" '^QDOC_EVIDENCE_P5A_STATUS=pending$' "pending smoke stdout"
assert_contains "$(case_stdout "pending_non_strict_warns")" '^QDOC_EVIDENCE_MANUAL_SMOKE_STATUS=pending$' "pending smoke stdout"
assert_not_contains "$(case_stdout "pending_non_strict_warns")" 'https://qdoc\.example\.com' "pending smoke stdout"
assert_contains "$(case_stderr "pending_non_strict_warns")" 'completed with [0-9]+ warning' "pending smoke stderr"

run_case "strict_pending_blocks" 1 "QDOC_SMOKE_STRICT=true"
assert_contains "$(case_stderr "strict_pending_blocks")" 'Public release preflight is pending' "strict pending stderr"
assert_contains "$(case_stderr "strict_pending_blocks")" 'P5-A staff/admin OTP sign-in is pending' "strict pending stderr"
assert_contains "$(case_stderr "strict_pending_blocks")" 'portfolio smoke evidence found [0-9]+ blocking issue' "strict pending stderr"

run_case "old_p5a_partial_statuses_stay_pending" 0 \
  "QDOC_SMOKE_STAFF_ADMIN_DATA=passed" \
  "QDOC_SMOKE_STAFF_TESTER_MEMBERSHIP=passed" \
  "QDOC_SMOKE_STAFF_ROLE_BOUNDARY=passed"
assert_contains "$(case_stdout "old_p5a_partial_statuses_stay_pending")" '^P5-A Staff demo access: pending$' "partial P5-A stdout"
assert_contains "$(case_stdout "old_p5a_partial_statuses_stay_pending")" '^  Staff/admin OTP sign-in: pending$' "partial P5-A stdout"
assert_contains "$(case_stdout "old_p5a_partial_statuses_stay_pending")" '^  Authorized tester access: pending$' "partial P5-A stdout"
assert_contains "$(case_stdout "old_p5a_partial_statuses_stay_pending")" '^  Unrostered staff denial: pending$' "partial P5-A stdout"

run_case "p5a_all_statuses_passes" 0 "${P5A_PASSED_STATUSES[@]}"
assert_contains "$(case_stdout "p5a_all_statuses_passes")" '^P5-A Staff demo access: passed$' "P5-A passed stdout"
assert_contains "$(case_stdout "p5a_all_statuses_passes")" '^QDOC_EVIDENCE_P5A_STATUS=passed$' "P5-A passed stdout"
assert_contains "$(case_stdout "p5a_all_statuses_passes")" '^Manual smoke: pending$' "P5-A passed stdout"

run_case "invalid_status_blocks" 1 "QDOC_SMOKE_MAP_PAN_ZOOM=maybe"
assert_contains "$(case_stderr "invalid_status_blocks")" 'P5-B pan/zoom controls must be passed, pending, not_run, or failed' "invalid status stderr"
assert_contains "$(case_stdout "invalid_status_blocks")" '^P5-B Provider map public-browser: failed$' "invalid status stdout"

run_case "all_packages_pass" 0 "${ALL_PASSED_STATUSES[@]}"
assert_contains "$(case_stdout "all_packages_pass")" '^QDOC_EVIDENCE_P5A_STATUS=passed$' "all passed stdout"
assert_contains "$(case_stdout "all_packages_pass")" '^QDOC_EVIDENCE_P5B_STATUS=passed$' "all passed stdout"
assert_contains "$(case_stdout "all_packages_pass")" '^QDOC_EVIDENCE_P5C_STATUS=passed$' "all passed stdout"
assert_contains "$(case_stdout "all_packages_pass")" '^QDOC_EVIDENCE_P5D_STATUS=passed$' "all passed stdout"
assert_contains "$(case_stdout "all_packages_pass")" '^QDOC_EVIDENCE_MANUAL_SMOKE_STATUS=passed$' "all passed stdout"
assert_contains "$(case_stdout "all_packages_pass")" '^Manual smoke: passed$' "all passed stdout"
assert_not_contains "$(case_stderr "all_packages_pass")" 'WARN|FAIL|ERROR' "all passed stderr"

printf 'portfolio smoke evidence self-test: passed\n'
