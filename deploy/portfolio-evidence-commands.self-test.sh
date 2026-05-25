#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO_EVIDENCE_COMMANDS="$SCRIPT_DIR/portfolio-evidence-commands.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_SHA="0123456789abcdef0123456789abcdef01234567"

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
  shift

  (
    cd "$TMP_DIR"
    env \
      QDOC_PUBLIC_URL=https://qdoc.example.invalid \
      QDOC_EXPECTED_RELEASE_SHA="$FAKE_SHA" \
      "$@" \
      bash "$PORTFOLIO_EVIDENCE_COMMANDS"
  ) >"$(case_stdout "$name")" 2>"$(case_stderr "$name")"
}

assert_contains() {
  local file="$1"
  local expected="$2"
  local label="$3"

  if ! grep -Fq -- "$expected" "$file"; then
    printf 'FAIL: expected %s to contain %s\n' "$label" "$expected" >&2
    sed -n '1,240p' "$file" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"
  local label="$3"

  if grep -Fq -- "$unexpected" "$file"; then
    printf 'FAIL: expected %s not to contain %s\n' "$label" "$unexpected" >&2
    sed -n '1,240p' "$file" >&2
    exit 1
  fi
}

assert_occurs() {
  local file="$1"
  local expected="$2"
  local count="$3"
  local label="$4"
  local actual

  actual="$(grep -F -c -- "$expected" "$file" || true)"
  if [ "$actual" != "$count" ]; then
    printf 'FAIL: expected %s to contain %s %s time(s), got %s\n' "$label" "$expected" "$count" "$actual" >&2
    sed -n '1,240p' "$file" >&2
    exit 1
  fi
}

run_case "default_site_ids"
assert_contains "$(case_stdout "default_site_ids")" "Candidate SHA: $FAKE_SHA" "default command plan"
assert_contains "$(case_stdout "default_site_ids")" "Expected app image: qdoc-app:$FAKE_SHA" "default command plan"
assert_contains "$(case_stdout "default_site_ids")" "Launch site IDs: site-waterloo,site-kitchener,site-university" "default command plan"
assert_contains "$(case_stdout "default_site_ids")" "SSM deploy document: QDoc-StagingDeploy" "default command plan"
assert_contains "$(case_stdout "default_site_ids")" 'AWS_REGION=\<aws-region\>' "default command plan"
assert_contains "$(case_stdout "default_site_ids")" "pnpm deploy:sync-ssm-document" "default command plan"
assert_occurs "$(case_stdout "default_site_ids")" "QDOC_ADMIN_DATA_EXPECT_SITE_IDS=site-waterloo\\,site-kitchener\\,site-university" 2 "default command plan"
assert_occurs "$(case_stdout "default_site_ids")" "QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-waterloo\\,site-kitchener\\,site-university" 2 "default command plan"
assert_contains "$(case_stdout "default_site_ids")" 'QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL"' "default command plan"
assert_not_contains "$(case_stdout "default_site_ids")" "<40-character-git-sha>" "default command plan"
assert_not_contains "$(case_stderr "default_site_ids")" "Candidate SHA should be" "default command plan stderr"

run_case "custom_site_ids" \
  AWS_REGION=us-east-1 \
  QDOC_SSM_DOCUMENT_NAME=QDoc-CustomDeploy \
  QDOC_ADMIN_DATA_EXPECT_SITE_IDS=site-alpha,site-beta \
  QDOC_IMAGE_NAME=qdoc-custom \
  QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=false
assert_contains "$(case_stdout "custom_site_ids")" "Expected app image: qdoc-custom:$FAKE_SHA" "custom command plan"
assert_contains "$(case_stdout "custom_site_ids")" "QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=false" "custom command plan"
assert_contains "$(case_stdout "custom_site_ids")" "Launch site IDs: site-alpha,site-beta" "custom command plan"
assert_contains "$(case_stdout "custom_site_ids")" "SSM deploy document: QDoc-CustomDeploy" "custom command plan"
assert_contains "$(case_stdout "custom_site_ids")" "AWS_REGION=us-east-1" "custom command plan"
assert_contains "$(case_stdout "custom_site_ids")" "QDOC_SSM_DOCUMENT_NAME=QDoc-CustomDeploy" "custom command plan"
assert_occurs "$(case_stdout "custom_site_ids")" "QDOC_ADMIN_DATA_EXPECT_SITE_IDS=site-alpha\\,site-beta" 2 "custom command plan"
assert_occurs "$(case_stdout "custom_site_ids")" "QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-alpha\\,site-beta" 2 "custom command plan"
assert_not_contains "$(case_stderr "custom_site_ids")" "QDOC_PUBLIC_URL is not set" "custom command plan stderr"
assert_not_contains "$(case_stderr "custom_site_ids")" "AWS_REGION is not set" "custom command plan stderr"

printf 'portfolio evidence command plan self-test: passed\n'
