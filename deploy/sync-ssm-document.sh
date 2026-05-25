#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCUMENT_NAME="${QDOC_SSM_DOCUMENT_NAME:-QDoc-StagingDeploy}"
DOCUMENT_PATH="${QDOC_SSM_DOCUMENT_PATH:-$REPO_ROOT/deploy/ssm/qdoc-staging-deploy.yaml}"
AWS_REGION_VALUE="${AWS_REGION:-${QDOC_AWS_REGION:-}}"
CREATE_DOCUMENT="${QDOC_SSM_CREATE_DOCUMENT:-false}"

AWS_ARGS=()
if [ -n "$AWS_REGION_VALUE" ]; then
  AWS_ARGS+=(--region "$AWS_REGION_VALUE")
fi

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

aws_ssm() {
  aws "${AWS_ARGS[@]}" ssm "$@"
}

describe_document_version() {
  aws_ssm describe-document \
    --name "$DOCUMENT_NAME" \
    --query "Document.$1" \
    --output text
}

need_command aws
need_command grep
need_command mktemp

[ -f "$DOCUMENT_PATH" ] || fail "SSM document file not found: $DOCUMENT_PATH"

UPDATE_ERROR_PATH=""
REMOTE_DOCUMENT_PATH=""
cleanup() {
  [ -z "$UPDATE_ERROR_PATH" ] || rm -f "$UPDATE_ERROR_PATH"
  [ -z "$REMOTE_DOCUMENT_PATH" ] || rm -f "$REMOTE_DOCUMENT_PATH"
}
trap cleanup EXIT

case "$CREATE_DOCUMENT" in
  true | false) ;;
  *) fail "QDOC_SSM_CREATE_DOCUMENT must be true or false" ;;
esac

log "Checking SSM document $DOCUMENT_NAME"

if ! describe_document_version LatestVersion >/dev/null 2>&1; then
  if [ "$CREATE_DOCUMENT" != "true" ]; then
    fail "SSM document does not exist. Set QDOC_SSM_CREATE_DOCUMENT=true to create it."
  fi

  log "Creating SSM document"
  aws_ssm create-document \
    --name "$DOCUMENT_NAME" \
    --document-type Command \
    --document-format YAML \
    --content "file://$DOCUMENT_PATH" >/dev/null
fi

log "Updating SSM document content"
UPDATE_ERROR_PATH="$(mktemp)"
set +e
UPDATED_VERSION="$(
  aws_ssm update-document \
    --name "$DOCUMENT_NAME" \
    --document-version '$LATEST' \
    --document-format YAML \
    --content "file://$DOCUMENT_PATH" \
    --query 'DocumentDescription.LatestVersion' \
    --output text 2>"$UPDATE_ERROR_PATH"
)"
UPDATE_EXIT=$?
set -e

if [ "$UPDATE_EXIT" -ne 0 ]; then
  if grep -q 'DuplicateDocumentContent' "$UPDATE_ERROR_PATH"; then
    UPDATED_VERSION="$(describe_document_version LatestVersion)"
    log "SSM document content already exists as latest version"
  else
    fail "SSM document update failed. Check AWS credentials, region, and ssm:UpdateDocument permission."
  fi
fi

[ -n "$UPDATED_VERSION" ] && [ "$UPDATED_VERSION" != "None" ] || fail "Could not resolve updated SSM document version"

log "Setting default SSM document version to $UPDATED_VERSION"
aws_ssm update-document-default-version \
  --name "$DOCUMENT_NAME" \
  --document-version "$UPDATED_VERSION" >/dev/null

DEFAULT_VERSION="$(describe_document_version DefaultVersion)"
if [ "$DEFAULT_VERSION" != "$UPDATED_VERSION" ]; then
  fail "Default SSM document version did not update"
fi

REMOTE_DOCUMENT_PATH="$(mktemp)"
aws_ssm get-document \
  --name "$DOCUMENT_NAME" \
  --document-version '$DEFAULT' \
  --query Content \
  --output text > "$REMOTE_DOCUMENT_PATH"

for required_member in \
  deploy/bootstrap-staff-admins.self-test.sh \
  deploy/sync-ssm-document.sh
do
  if ! grep -Fq "$required_member" "$REMOTE_DOCUMENT_PATH"; then
    fail "Default SSM document is missing required ops bundle member: $required_member"
  fi
done

log "SSM document default version is synchronized"
