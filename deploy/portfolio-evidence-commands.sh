#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${QDOC_PUBLIC_URL:-https://qdoc.example.com}"
CANDIDATE_SHA="${QDOC_RELEASE_SHA:-${QDOC_EXPECTED_RELEASE_SHA:-}}"
IMAGE_NAME="${QDOC_IMAGE_NAME:-qdoc-app}"
BACKUP_DIR="${QDOC_BACKUP_DIR:-/opt/qdoc/backups}"
REQUIRE_PROVIDER_MAP="${QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP:-true}"
LAUNCH_SITE_IDS="${QDOC_ADMIN_DATA_EXPECT_SITE_IDS:-site-waterloo,site-kitchener,site-university}"
AWS_REGION_VALUE="${AWS_REGION:-${QDOC_AWS_REGION:-}}"
SSM_DOCUMENT_NAME="${QDOC_SSM_DOCUMENT_NAME:-QDoc-StagingDeploy}"

warnings=0

warn() {
  warnings=$((warnings + 1))
  printf 'WARN: %s\n' "$*" >&2
}

quote() {
  printf '%q' "$1"
}

current_git_sha() {
  git rev-parse HEAD 2>/dev/null || true
}

git_ahead_summary() {
  git status --short --branch 2>/dev/null | sed -n '1p' || true
}

git_worktree_status() {
  git status --porcelain 2>/dev/null || true
}

if [ -z "$CANDIDATE_SHA" ]; then
  CANDIDATE_SHA="$(current_git_sha)"
fi

if [ -z "$CANDIDATE_SHA" ]; then
  CANDIDATE_SHA="<40-character-git-sha>"
  warn "No candidate SHA was supplied and this directory is not a Git checkout; set QDOC_EXPECTED_RELEASE_SHA"
fi

if [[ ! "$CANDIDATE_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  warn "Candidate SHA should be a 40-character Git SHA before evidence collection"
fi

if [ "$PUBLIC_URL" = "https://qdoc.example.com" ]; then
  warn "QDOC_PUBLIC_URL is not set; commands below use the documentation placeholder"
fi

if [ -z "$AWS_REGION_VALUE" ]; then
  AWS_REGION_VALUE="<aws-region>"
  warn "AWS_REGION is not set; SSM document sync command below uses the documentation placeholder"
fi

branch_summary="$(git_ahead_summary)"
case "$branch_summary" in
  *"[ahead "*)
    warn "Local branch is ahead of its upstream. Push and wait for staging deploy before public evidence."
    ;;
esac

if [ -n "$(git_worktree_status)" ]; then
  warn "Worktree has uncommitted changes. Commit or intentionally discard them before using HEAD as release evidence."
fi

cat <<EOF
QDoc portfolio evidence command plan

Release identity:
  Candidate SHA: $CANDIDATE_SHA
  Expected app image: ${IMAGE_NAME}:$CANDIDATE_SHA
  Public URL: $PUBLIC_URL
  Launch site IDs: $LAUNCH_SITE_IDS
  SSM deploy document: $SSM_DOCUMENT_NAME

Prerequisite:
  Sync the default SSM deploy document, push the candidate, wait for the staging workflow to deploy it, then confirm /api/release matches the same SHA.
  If the SSM document does not exist yet, run the one-time create command below instead of the normal sync command.
  Run local pnpm steps from the QDoc repository checkout. Deployed-host steps below explicitly change to /opt/qdoc/current.

0. SSM deploy document sync before staging workflow rerun

cd "\$(git rev-parse --show-toplevel)"
AWS_REGION=$(quote "$AWS_REGION_VALUE") \\
QDOC_SSM_DOCUMENT_NAME=$(quote "$SSM_DOCUMENT_NAME") \\
pnpm deploy:sync-ssm-document

0a. One-time SSM deploy document create if step 0 reports that the document does not exist

cd "\$(git rev-parse --show-toplevel)"
QDOC_SSM_CREATE_DOCUMENT=true \\
AWS_REGION=$(quote "$AWS_REGION_VALUE") \\
QDOC_SSM_DOCUMENT_NAME=$(quote "$SSM_DOCUMENT_NAME") \\
pnpm deploy:sync-ssm-document

1. Public release preflight

cd "\$(git rev-parse --show-toplevel)"
QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
QDOC_EXPECTED_RELEASE_SHA=$(quote "$CANDIDATE_SHA") \\
pnpm verify:public-release

2. Public browser portfolio smoke

cd "\$(git rev-parse --show-toplevel)"
QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
QDOC_PORTFOLIO_EXPECT_RELEASE_SHA=$(quote "$CANDIDATE_SHA") \\
QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=$(quote "$REQUIRE_PROVIDER_MAP") \\
pnpm e2e:portfolio

3. Staging verifier from the deployed host

cd /opt/qdoc/current
sudo env \\
  QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
  QDOC_VERIFY_OUTBOX=true \\
  QDOC_VERIFY_OPS=true \\
  QDOC_VERIFY_ADMIN_DATA=true \\
  QDOC_ADMIN_DATA_EXPECT_SITE_IDS=$(quote "$LAUNCH_SITE_IDS") \\
  QDOC_VERIFY_LAUNCH=true \\
  QDOC_VERIFY_EMAIL=true \\
  bash deploy/verify-staging.sh

4. Existing-database staff/admin bootstrap dry-run from the deployed host

# Set REAL_STAFF_EMAIL in your shell to the real OTP-receivable staff/admin inbox before running.
cd /opt/qdoc/current
sudo env \\
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="\$REAL_STAFF_EMAIL" \\
  QDOC_BOOTSTRAP_STAFF_SITE_IDS=$(quote "$LAUNCH_SITE_IDS") \\
  bash deploy/bootstrap-staff-admins.sh

5. Existing-database staff/admin bootstrap apply from the deployed host

# Run only after the dry-run plan shows the expected site count.
cd /opt/qdoc/current
sudo env \\
  QDOC_BOOTSTRAP_STAFF_CONFIRM=apply \\
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="\$REAL_STAFF_EMAIL" \\
  QDOC_BOOTSTRAP_STAFF_SITE_IDS=$(quote "$LAUNCH_SITE_IDS") \\
  bash deploy/bootstrap-staff-admins.sh

6. Staff/admin expectation verifier from the deployed host

# Run after bootstrap apply, before marking QDOC_SMOKE_STAFF_ADMIN_DATA=passed.
cd /opt/qdoc/current
sudo env \\
  QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
  QDOC_VERIFY_ADMIN_DATA=true \\
  QDOC_ADMIN_DATA_EXPECT_SITE_IDS=$(quote "$LAUNCH_SITE_IDS") \\
  QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS="\$REAL_STAFF_EMAIL" \\
  bash deploy/verify-staging.sh

7. Staging rehearsal from the deployed host

cd /opt/qdoc/current
sudo env \\
  QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
  QDOC_EXPECTED_RELEASE_SHA=$(quote "$CANDIDATE_SHA") \\
  QDOC_EXPECTED_APP_IMAGE=$(quote "${IMAGE_NAME}:$CANDIDATE_SHA") \\
  QDOC_REHEARSAL_BACKUP=true \\
  QDOC_REHEARSAL_LOAD_DRILLS=true \\
  QDOC_BACKUP_DIR=$(quote "$BACKUP_DIR") \\
  bash deploy/staging-rehearsal.sh

8. Portfolio smoke evidence rollup after manual browser/inbox checks

cd "\$(git rev-parse --show-toplevel)"
QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
QDOC_SMOKE_PUBLIC_RELEASE_PREFLIGHT=passed \\
QDOC_SMOKE_PUBLIC_BROWSER_SMOKE=passed \\
QDOC_SMOKE_STAFF_ADMIN_DATA=passed \\
QDOC_SMOKE_STAFF_ADMIN_SIGNIN=passed \\
QDOC_SMOKE_STAFF_TESTER_AUTH=passed \\
QDOC_SMOKE_STAFF_TESTER_MEMBERSHIP=passed \\
QDOC_SMOKE_STAFF_ROLE_BOUNDARY=passed \\
QDOC_SMOKE_UNROSTERED_STAFF_DENIAL=passed \\
QDOC_SMOKE_PROVIDER_RESTRICTIONS=passed \\
QDOC_SMOKE_MAP_GEO_CENTER=passed \\
QDOC_SMOKE_MAP_PAN_ZOOM=passed \\
QDOC_SMOKE_MAP_RECENTER=passed \\
QDOC_SMOKE_MARKER_CARD_SYNC=passed \\
QDOC_SMOKE_QDOC_PROVIDER_DISTINCTION=passed \\
QDOC_SMOKE_MAP_FAIL_CLOSED=passed \\
QDOC_SMOKE_PATIENT_OTP_DELIVERY=passed \\
QDOC_SMOKE_STAFF_OTP_DELIVERY=passed \\
QDOC_SMOKE_AUTH_ERROR_COPY=passed \\
QDOC_SMOKE_SESSION_REVISIT=passed \\
QDOC_SMOKE_PATIENT_CHECKIN=passed \\
QDOC_SMOKE_PATIENT_STATUS_REVISIT=passed \\
QDOC_SMOKE_STAFF_QUEUE_OPS=passed \\
QDOC_SMOKE_STAFF_QUEUE_CONTROLS=passed \\
QDOC_SMOKE_MEMBERSHIP_AUDIT=passed \\
QDOC_SMOKE_AUDIT_LOG_REVIEW=passed \\
QDOC_SMOKE_NOTIFICATION_OUTBOX=passed \\
QDOC_SMOKE_WORKER_DUPLICATE_GUARD=passed \\
QDOC_SMOKE_STRICT=true \\
pnpm verify:portfolio-smoke

9. Release evidence preflight

# Fill artifact/checksum/SSM/backup/rollback values from the successful deploy and rehearsal.
cd "\$(git rev-parse --show-toplevel)"
QDOC_PUBLIC_URL=$(quote "$PUBLIC_URL") \\
QDOC_EXPECTED_RELEASE_SHA=$(quote "$CANDIDATE_SHA") \\
QDOC_EXPECTED_APP_IMAGE=$(quote "${IMAGE_NAME}:$CANDIDATE_SHA") \\
QDOC_APP_ARTIFACT_URI=s3://<artifact-bucket>/staging/$CANDIDATE_SHA/qdoc-app.tar.gz \\
QDOC_OPS_BUNDLE_URI=s3://<artifact-bucket>/staging/$CANDIDATE_SHA/qdoc-ops.tar.gz \\
QDOC_APP_ARTIFACT_SHA256=<app-artifact-sha256> \\
QDOC_OPS_BUNDLE_SHA256=<ops-bundle-sha256> \\
QDOC_SSM_COMMAND_ID=<ssm-command-id> \\
QDOC_BACKUP_PATH=$BACKUP_DIR/<backup-file>.dump \\
QDOC_ROLLBACK_SHA=<known-good-sha> \\
QDOC_ROLLBACK_APP_ARTIFACT_URI=s3://<artifact-bucket>/staging/<known-good-sha>/qdoc-app.tar.gz \\
QDOC_ROLLBACK_OPS_BUNDLE_URI=s3://<artifact-bucket>/staging/<known-good-sha>/qdoc-ops.tar.gz \\
QDOC_ROLLBACK_BACKUP_PATH=$BACKUP_DIR/<known-good-backup-file>.dump \\
QDOC_EVIDENCE_LOCAL_CHECKS_STATUS=passed \\
QDOC_EVIDENCE_STAGING_VERIFIER_STATUS=passed \\
QDOC_EVIDENCE_STAGING_REHEARSAL_STATUS=passed \\
QDOC_EVIDENCE_BACKUP_RESTORE_CHECK_STATUS=passed \\
QDOC_EVIDENCE_MANUAL_SMOKE_STATUS=passed \\
QDOC_EVIDENCE_P5A_STATUS=passed \\
QDOC_EVIDENCE_P5B_STATUS=passed \\
QDOC_EVIDENCE_P5C_STATUS=passed \\
QDOC_EVIDENCE_P5D_STATUS=passed \\
QDOC_EVIDENCE_P5E_STATUS=passed \\
QDOC_GO_NO_GO_DECISION=GO \\
QDOC_EVIDENCE_STRICT=true \\
pnpm verify:release-evidence

EOF

if [ "$warnings" -gt 0 ]; then
  printf 'Generated command plan with %s warning(s). Resolve warnings before final GO evidence.\n' "$warnings" >&2
fi
