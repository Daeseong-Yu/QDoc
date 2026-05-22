# QDoc Release Go/No-Go

Use this checklist for a launch-candidate decision. Record command status, short safe summaries, commit SHAs, artifact identifiers, and operator notes. Do not paste secrets, OTP codes, database dumps, private deployment logs, patient payloads, or raw connection strings into the evidence.

## Release Identity

- Candidate Git SHA: `<40-character-sha>`
- Docker image tag: `qdoc-app:<sha>`
- S3 artifact URI: `s3://<private-bucket>/staging/<sha>/qdoc-app.tar.gz`
- Artifact SHA-256: `<sha256-from-workflow>`
- Staging public URL: `https://qdoc.example.com`
- Database migration range reviewed: `<from-sha>..<to-sha>`
- Rollback target SHA and artifact confirmed: `<known-good-sha>`

## Local Required Checks

Run these from the repository root before staging promotion.

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm db:validate
pnpm verify:outbox
pnpm verify:ops
pnpm verify:launch
pnpm e2e
git diff --check
```

Go criteria:

- Every command exits zero.
- `verify:ops` has no stale processing outbox jobs, failed notification jobs, failed almost-ready email jobs, or map guardrail attention states.
- `verify:launch` reports launch-like hardening ready for the target environment when staging or production env is loaded.
- E2E runs against a local or explicitly isolated test database only.
- No local-only config, `.env`, backup, screenshot, trace, or generated secret material is staged.

No-go criteria:

- Any required check fails without a documented, accepted non-launch-blocking reason.
- E2E targets a shared staging or production database.
- A required launch setting is only present in local `.env` and not in the target environment.

## Staging Evidence

Run staging checks from the EC2 checkout or equivalent deployment operator shell after the candidate artifact is deployed.

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_VERIFY_OUTBOX=true \
QDOC_VERIFY_OPS=true \
QDOC_VERIFY_ADMIN_DATA=true \
QDOC_VERIFY_LAUNCH=true \
bash deploy/verify-staging.sh
```

Run the full rehearsal when the backup directory and public URL are configured:

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_EXPECTED_SOURCE_REF=<git-sha> \
QDOC_EXPECTED_APP_IMAGE=qdoc-app:<git-sha> \
QDOC_REHEARSAL_BACKUP=true \
QDOC_REHEARSAL_LOAD_DRILLS=true \
QDOC_BACKUP_DIR=/opt/qdoc/backups \
bash deploy/staging-rehearsal.sh
```

Go criteria:

- Compose services are healthy and only web is bound to host loopback.
- Public Caddy route returns success for the expected domain.
- Outbox, ops, admin-data, launch-hardening, backup restore-check, and bounded drill checks exit zero.
- The operator records SSM command ID, artifact SHA, candidate source SHA, backup filename, and restore-check pass/fail without copying private logs or dump files into Git.

No-go criteria:

- Public URL is missing or points at a different artifact/source SHA.
- Backup restore-check has not passed for the launch database.
- `verify:admin-data` shows missing launch clinic, queue, staff admin, or map guardrail records.
- `verify:launch` reports console/fixed OTP enabled, missing SMTP, weak session secret, non-HTTPS app URL, public web bind, or map hard-stop misconfiguration in a launch-like environment.

## Manual Smoke Checks

Run these in staging after automated checks pass and real email delivery is approved.

1. Patient requests OTP, signs in, selects a launch clinic, checks in, and sees an active ticket.
2. Patient refreshes or reopens the app and remains in the expected authenticated/ticket state.
3. Staff signs in at `/staff` with a site-scoped account and sees only authorized clinic queues.
4. Staff calls, starts, and completes the patient ticket; patient status updates through polling or SSE fallback behavior.
5. Staff delays and restores another eligible ticket; restored ticket returns to the front of the waiting queue.
6. Almost-ready notification work appears in operational checks without duplicate delivery.
7. Map UI either loads only after a successful QDoc usage reservation or falls back cleanly when maps are disabled or exhausted.

Go criteria:

- Patient and staff flows complete without invalid state transitions or authorization leaks.
- Worker/outbox processing remains healthy after smoke checks.
- No OTPs, provider secrets, raw patient payloads, or database URLs appear in captured evidence.

## Manual Environment Work

Confirm these account-level and host-level items before go:

- DNS points the launch domain at the expected EC2 address.
- Security group exposes only approved public ports, normally `80` and `443`.
- Host Caddy proxies the launch domain to `127.0.0.1:${QDOC_WEB_PORT}`.
- `.env.staging` or production env contains HTTPS `APP_URL`, long `SESSION_SECRET`, SMTP settings, Redis URL, database URL, and disabled OTP debug flags.
- GitHub OIDC role, S3 bucket lifecycle, SSM document, EC2 instance profile, and environment secrets are configured in the operating account.
- Map provider remains disabled, or provider-side restrictions, browser credential limits, QDoc monthly hard-stop, and map usage rate limits are all configured.
- Database backup is copied to encrypted off-host storage and a restore-check has passed.
- Rollback artifact and matching backup are available before launch.

## Rollback Readiness

Before go, identify a known-good artifact and database backup.

```bash
aws ssm list-command-invocations --command-id <command-id> --details
aws s3 ls s3://<private-bucket>/staging/<known-good-sha>/
docker compose -f compose.staging.yaml --env-file .env.staging ps
```

Rollback procedure:

1. Stop feature promotion and preserve current logs without exposing secrets.
2. Re-run the SSM deployment document for the known-good artifact SHA and image tag.
3. Run `QDOC_PUBLIC_URL=https://qdoc.example.com bash deploy/verify-staging.sh`.
4. Restore the database only during an approved recovery window, using the documented `QDOC_RESTORE_CONFIRM=restore-qdoc` flow.
5. Re-run full staging verification and manual patient/staff smoke checks after rollback or restore.

No-go criteria:

- No known-good artifact exists in S3.
- No matching database backup exists for a migration-bearing release.
- The release includes forward-only database changes whose rollback impact has not been reviewed.

## Decision Record

Use this block in the release notes or ticket:

```text
Decision: GO | NO-GO
Candidate SHA:
Artifact URI:
Artifact SHA-256:
Staging URL:
Local checks:
Staging verifier:
Staging rehearsal:
Backup restore-check:
Manual smoke:
Known risks:
Rollback target:
Operator:
Decision time:
```

Choose `GO` only when all local checks, staging evidence, manual smoke checks, environment work, and rollback readiness are complete or any remaining risk has an explicit owner and accepted launch impact. Otherwise choose `NO-GO` and record the blocking items.
