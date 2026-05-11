#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <s3-artifact-uri> <image-tag> [source-ref] [expected-sha256]" >&2
  exit 64
fi

S3_ARTIFACT_URI="$1"
IMAGE_TAG="$2"
SOURCE_REF="${3:-}"
EXPECTED_SHA256="${4:-}"
APP_DIR="${QDOC_DEPLOY_DIR:-/opt/qdoc}"
COMPOSE_FILE="${QDOC_COMPOSE_FILE:-compose.staging.yaml}"
ENV_FILE="${QDOC_ENV_FILE:-.env.staging}"
IMAGE_NAME="${QDOC_IMAGE_NAME:-qdoc-app}"
DEPLOY_WAIT_TIMEOUT="${QDOC_DEPLOY_WAIT_TIMEOUT:-180}"
LOCK_FILE="${QDOC_DEPLOY_LOCK_FILE:-/var/lock/qdoc-deploy.lock}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qdoc-deploy.XXXXXX")"
ARTIFACT_PATH="${TMP_DIR}/qdoc-app.tar.gz"
CHECKSUM_PATH="${TMP_DIR}/qdoc-app.tar.gz.sha256"

chmod 700 "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ ! "$S3_ARTIFACT_URI" =~ ^s3://[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]/staging/[0-9a-f]{40}/qdoc-app\.tar\.gz$ ]]; then
  echo "Invalid S3 artifact URI" >&2
  exit 64
fi

if [[ ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid image tag: $IMAGE_TAG" >&2
  exit 64
fi

if [ -n "$SOURCE_REF" ] && [[ ! "$SOURCE_REF" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid source ref: $SOURCE_REF" >&2
  exit 64
fi

if [ -n "$EXPECTED_SHA256" ] && [[ ! "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Invalid expected SHA-256 digest" >&2
  exit 64
fi

for command_name in aws docker flock git gunzip sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 69
  fi
done

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another QDoc deployment is already running" >&2
  exit 75
fi

cd "$APP_DIR"

if [ -n "$SOURCE_REF" ]; then
  if ! git fetch --depth 1 origin "$SOURCE_REF"; then
    git fetch --depth 50 origin main
  fi
  git checkout --force "$SOURCE_REF"
fi

aws s3 cp "$S3_ARTIFACT_URI" "$ARTIFACT_PATH"
aws s3 cp "${S3_ARTIFACT_URI}.sha256" "$CHECKSUM_PATH"

(
  cd "$(dirname "$ARTIFACT_PATH")"
  sha256sum -c "$(basename "$CHECKSUM_PATH")"
)

ACTUAL_SHA256="$(cut -d ' ' -f1 "$CHECKSUM_PATH")"
if [ -n "$EXPECTED_SHA256" ] && [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "Artifact checksum does not match expected digest" >&2
  exit 65
fi

LOAD_OUTPUT="$(gunzip -c "$ARTIFACT_PATH" | docker load)"
echo "$LOAD_OUTPUT"
docker image inspect "${IMAGE_NAME}:${IMAGE_TAG}" >/dev/null

export QDOC_APP_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
export QDOC_WEB_BIND="${QDOC_WEB_BIND:-127.0.0.1}"

if [ "$QDOC_WEB_BIND" != "127.0.0.1" ]; then
  echo "QDOC_WEB_BIND must remain 127.0.0.1 for staging" >&2
  exit 78
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-build --wait --wait-timeout "$DEPLOY_WAIT_TIMEOUT"
docker image prune -f --filter "label=app=qdoc"
