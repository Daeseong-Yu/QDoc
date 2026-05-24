#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${ROOT_DIR}/deploy/bootstrap-staff-admins.sh"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qdoc-staff-bootstrap-test.XXXXXX")"
FAKE_BIN="${WORK_DIR}/bin"
COMPOSE_FILE="${WORK_DIR}/compose.staging.yaml"
ENV_FILE="${WORK_DIR}/.env.staging"
SAFE_EMAIL="admin@clinic.test"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$FAKE_BIN"
printf 'services: {}\n' > "$COMPOSE_FILE"

cat > "${FAKE_BIN}/docker" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

case " $* " in
  *" compose "* | compose\ *) ;;
  *)
    echo "unexpected docker invocation" >&2
    exit 90
    ;;
esac

[ "${QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS:-}" = "admin@clinic.test" ] || {
  echo "staff admin email was not exported to docker" >&2
  exit 91
}

printf 'docker-bootstrap-called\n'
printf 'dry_run=%s\n' "${QDOC_BOOTSTRAP_STAFF_DRY_RUN:-}"
printf 'confirm=%s\n' "${QDOC_BOOTSTRAP_STAFF_CONFIRM:-}"
printf 'site_ids=%s\n' "${QDOC_BOOTSTRAP_STAFF_SITE_IDS:-}"
SCRIPT
chmod +x "${FAKE_BIN}/docker"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local text="$1"
  local expected="$2"

  case "$text" in
    *"$expected"*) ;;
    *) fail "Expected output to contain: $expected" ;;
  esac
}

assert_not_contains() {
  local text="$1"
  local unexpected="$2"

  case "$text" in
    *"$unexpected"*) fail "Output leaked unexpected text: $unexpected" ;;
    *) ;;
  esac
}

run_target() {
  env \
    PATH="${FAKE_BIN}:${PATH}" \
    QDOC_COMPOSE_FILE="$COMPOSE_FILE" \
    QDOC_ENV_FILE="$ENV_FILE" \
    "$@" \
    bash "$TARGET"
}

run_success() {
  local output

  output="$(run_target "$@" 2>&1)"
  printf '%s' "$output"
}

run_failure() {
  local output status

  set +e
  output="$(run_target "$@" 2>&1)"
  status=$?
  set -e

  [ "$status" -ne 0 ] || fail "Expected command to fail"
  printf '%s' "$output"
}

write_env() {
  printf '%s\n' "$@" > "$ENV_FILE"
}

write_env \
  "QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS=\"${SAFE_EMAIL}\"" \
  "QDOC_ADMIN_DATA_EXPECT_SITE_IDS=\"site-alpha,site-beta\""
output="$(run_success)"
assert_contains "$output" "Planning staff admin membership bootstrap in the staging image"
assert_contains "$output" "docker-bootstrap-called"
assert_contains "$output" "dry_run=true"
assert_contains "$output" "confirm="
assert_contains "$output" "site_ids=site-alpha,site-beta"
assert_not_contains "$output" "$SAFE_EMAIL"

write_env "QDOC_SEED_STAFF_ADMIN_EMAILS='${SAFE_EMAIL}'"
output="$(run_success QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-gamma)"
assert_contains "$output" "dry_run=true"
assert_contains "$output" "site_ids=site-gamma"
assert_not_contains "$output" "$SAFE_EMAIL"

write_env "QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS=\"${SAFE_EMAIL}\""
output="$(run_success QDOC_BOOTSTRAP_STAFF_CONFIRM=apply)"
assert_contains "$output" "Applying staff admin membership bootstrap in the staging image"
assert_contains "$output" "dry_run=false"
assert_contains "$output" "confirm=apply"
assert_not_contains "$output" "$SAFE_EMAIL"

write_env "QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS=\"${SAFE_EMAIL}\""
output="$(run_failure QDOC_BOOTSTRAP_STAFF_DRY_RUN=false)"
assert_contains "$output" "QDOC_BOOTSTRAP_STAFF_CONFIRM=apply is required"
assert_not_contains "$output" "$SAFE_EMAIL"

write_env "QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS=\"${SAFE_EMAIL}\""
output="$(run_failure QDOC_BOOTSTRAP_STAFF_DRY_RUN=maybe)"
assert_contains "$output" "QDOC_BOOTSTRAP_STAFF_DRY_RUN must be true or false"
assert_not_contains "$output" "$SAFE_EMAIL"

write_env "QDOC_ADMIN_DATA_EXPECT_SITE_IDS=\"site-alpha\""
output="$(run_failure)"
assert_contains "$output" "QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS is required"
assert_not_contains "$output" "$SAFE_EMAIL"

printf 'bootstrap-staff-admins deploy wrapper self-test passed\n'
