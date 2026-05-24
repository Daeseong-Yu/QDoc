#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_EVIDENCE="$SCRIPT_DIR/release-evidence.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

CANDIDATE_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ROLLBACK_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
APP_SHA256="1111111111111111111111111111111111111111111111111111111111111111"
OPS_SHA256="2222222222222222222222222222222222222222222222222222222222222222"

BASE_ENV=(
  "QDOC_PUBLIC_URL=https://qdoc.example.com"
  "QDOC_EXPECTED_RELEASE_SHA=$CANDIDATE_SHA"
  "QDOC_EXPECTED_APP_IMAGE=qdoc-app:$CANDIDATE_SHA"
  "QDOC_APP_ARTIFACT_URI=s3://qdoc-private-test/staging/$CANDIDATE_SHA/qdoc-app.tar.gz"
  "QDOC_OPS_BUNDLE_URI=s3://qdoc-private-test/staging/$CANDIDATE_SHA/qdoc-ops.tar.gz"
  "QDOC_APP_ARTIFACT_SHA256=$APP_SHA256"
  "QDOC_OPS_BUNDLE_SHA256=$OPS_SHA256"
  "QDOC_SSM_COMMAND_ID=11111111-2222-3333-4444-555555555555"
  "QDOC_BACKUP_PATH=/opt/qdoc/backups/qdoc-$CANDIDATE_SHA.dump"
  "QDOC_ROLLBACK_SHA=$ROLLBACK_SHA"
  "QDOC_ROLLBACK_APP_ARTIFACT_URI=s3://qdoc-private-test/staging/$ROLLBACK_SHA/qdoc-app.tar.gz"
  "QDOC_ROLLBACK_OPS_BUNDLE_URI=s3://qdoc-private-test/staging/$ROLLBACK_SHA/qdoc-ops.tar.gz"
  "QDOC_ROLLBACK_BACKUP_PATH=/opt/qdoc/backups/qdoc-$ROLLBACK_SHA.dump"
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
  env "${BASE_ENV[@]}" "$@" bash "$RELEASE_EVIDENCE" >"$(case_stdout "$name")" 2>"$(case_stderr "$name")"
  status=$?
  set -e

  if [ "$status" -ne "$expected_status" ]; then
    printf 'FAIL: %s exited with %s; expected %s\n' "$name" "$status" "$expected_status" >&2
    printf '%s\n' "--- stdout: $name ---" >&2
    sed -n '1,220p' "$(case_stdout "$name")" >&2
    printf '%s\n' "--- stderr: $name ---" >&2
    sed -n '1,220p' "$(case_stderr "$name")" >&2
    exit 1
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if ! grep -Eq -- "$pattern" "$file"; then
    printf 'FAIL: expected %s to contain %s\n' "$label" "$pattern" >&2
    sed -n '1,220p' "$file" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if grep -Eq -- "$pattern" "$file"; then
    printf 'FAIL: expected %s not to contain %s\n' "$label" "$pattern" >&2
    sed -n '1,220p' "$file" >&2
    exit 1
  fi
}

PASSED_STATUSES=(
  "QDOC_EVIDENCE_P5A_STATUS=passed"
  "QDOC_EVIDENCE_P5B_STATUS=passed"
  "QDOC_EVIDENCE_P5C_STATUS=passed"
  "QDOC_EVIDENCE_P5D_STATUS=passed"
  "QDOC_EVIDENCE_P5E_STATUS=passed"
  "QDOC_EVIDENCE_LOCAL_CHECKS_STATUS=passed"
  "QDOC_EVIDENCE_STAGING_VERIFIER_STATUS=passed"
  "QDOC_EVIDENCE_STAGING_REHEARSAL_STATUS=passed"
  "QDOC_EVIDENCE_BACKUP_RESTORE_CHECK_STATUS=passed"
  "QDOC_EVIDENCE_MANUAL_SMOKE_STATUS=passed"
)

run_case "go_with_pending_statuses_blocks" 1 "QDOC_GO_NO_GO_DECISION=GO"
assert_not_contains "$(case_stdout "go_with_pending_statuses_blocks")" '^Decision: GO$' "blocked GO stdout"
assert_contains "$(case_stderr "go_with_pending_statuses_blocks")" 'decision block was not generated' "blocked GO stderr"
assert_contains "$(case_stderr "go_with_pending_statuses_blocks")" 'GO decision requires P5-A Staff demo access to be passed' "blocked GO stderr"

run_case "no_go_with_pending_statuses_warns" 0 "QDOC_GO_NO_GO_DECISION=NO-GO"
assert_contains "$(case_stdout "no_go_with_pending_statuses_warns")" '^Decision: NO-GO$' "NO-GO stdout"
assert_contains "$(case_stderr "no_go_with_pending_statuses_warns")" 'completed with [0-9]+ warning' "NO-GO stderr"

run_case "go_with_all_required_statuses_passes" 0 "QDOC_GO_NO_GO_DECISION=GO" "${PASSED_STATUSES[@]}"
assert_contains "$(case_stdout "go_with_all_required_statuses_passes")" '^Decision: GO$' "passed GO stdout"
assert_contains "$(case_stdout "go_with_all_required_statuses_passes")" '^P5-E Operations evidence: passed$' "passed GO stdout"
assert_contains "$(case_stdout "go_with_all_required_statuses_passes")" '^Staging verifier: passed$' "passed GO stdout"
assert_contains "$(case_stdout "go_with_all_required_statuses_passes")" 's3://<private-bucket>/staging/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/qdoc-app.tar.gz' "passed GO stdout"
assert_not_contains "$(case_stdout "go_with_all_required_statuses_passes")" 'qdoc-private-test' "passed GO stdout"
assert_not_contains "$(case_stdout "go_with_all_required_statuses_passes")" '/opt/qdoc/backups' "passed GO stdout"

printf 'release evidence self-test: passed\n'
