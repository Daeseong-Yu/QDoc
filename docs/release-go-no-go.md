# QDoc Portfolio Release Go/No-Go

Use this checklist for a portfolio-ready launch-candidate decision. `GO` means QDoc can be presented publicly as a portfolio demo where visitors can test the main workflows without developer explanation. Record command status, short safe summaries, commit SHAs, artifact identifiers, and operator notes. Do not paste secrets, OTP codes, database dumps, private deployment logs, patient payloads, or raw connection strings into the evidence.

Do not start final GO evidence collection while known portfolio blockers remain open. At minimum, finish the interactive provider map, first-time OTP delivery, real staff/admin demo access, user-friendly auth/map error handling, patient/staff smoke path, notification/outbox health, backup restore-check, rollback target, and staging rehearsal.

Track remaining evidence by Step 5 work package:

1. P5-A Staff demo access
2. P5-B Provider map public-browser verification
3. P5-C OTP delivery and auth error usability
4. P5-D Public demo smoke
5. P5-E Operations evidence and decision

Do not mark a package complete from local tests alone when it depends on real inboxes, real provider credentials, public browser restrictions, deployed host settings, backup restore-checks, or rollback artifacts.

## Work Package Evidence

Fill this table for each release candidate. Keep the notes safe: use short summaries, commit SHAs, command names, and pass/fail outcomes; do not paste secrets, OTPs, private logs, raw patient payloads, provider credentials, or connection strings.

| Package | Required proof | Current status | Evidence location |
| --- | --- | --- | --- |
| P5-A Staff demo access | Real OTP-receivable staff/admin access, tester authorization path, unauthorized personal email denial | Pending staging/manual proof | `<link-or-note>` |
| P5-B Provider map public-browser | Geolocation-centered provider map, pan/zoom, recentering, marker/card sync, QDoc-vs-provider distinction, fail-closed states | Pending staging/manual proof | `<link-or-note>` |
| P5-C OTP delivery and auth errors | First-time SMTP delivery, readable retry/delivery/invalid/expired states, refresh/revisit session behavior | Pending staging/manual proof | `<link-or-note>` |
| P5-D Public demo smoke | Patient/staff/queue/notification/outbox/membership/audit-log/map path tested as a visitor/tester | Local automated extension passed; staging/manual proof pending | Local: `pnpm e2e --grep "notification preferences|notification health"` and `pnpm e2e`; staging: `<link-or-note>` |
| P5-E Operations evidence | Staging verifier, full rehearsal, backup restore-check, rollback target, GO/NO-GO decision | Pending staging/manual proof | `<link-or-note>` |

## Release Identity

- Candidate Git SHA: `<40-character-sha>`
- Docker image tag: `qdoc-app:<sha>`
- S3 app artifact URI: `s3://<private-bucket>/staging/<sha>/qdoc-app.tar.gz`
- S3 ops bundle URI: `s3://<private-bucket>/staging/<sha>/qdoc-ops.tar.gz`
- App artifact SHA-256: `<sha256-from-workflow>`
- Ops bundle SHA-256: `<sha256-from-workflow>`
- Staging public URL: `https://qdoc.example.com`
- Database migration range reviewed: `<from-sha>..<to-sha>`
- Rollback target SHA and artifact confirmed: `<known-good-sha>`

Before copying this section into the final decision record, run the read-only evidence preflight. It does not call AWS, Docker, SMTP, map providers, or the public site; it only checks provided identifiers and prints a commit-safe decision-record block with private operational identifiers redacted by default.

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_EXPECTED_RELEASE_SHA=<git-sha> \
QDOC_EXPECTED_APP_IMAGE=qdoc-app:<git-sha> \
QDOC_APP_ARTIFACT_URI=s3://<private-bucket>/staging/<git-sha>/qdoc-app.tar.gz \
QDOC_OPS_BUNDLE_URI=s3://<private-bucket>/staging/<git-sha>/qdoc-ops.tar.gz \
QDOC_APP_ARTIFACT_SHA256=<app-artifact-sha256> \
QDOC_OPS_BUNDLE_SHA256=<ops-bundle-sha256> \
QDOC_SSM_COMMAND_ID=<ssm-command-id> \
QDOC_BACKUP_PATH=/opt/qdoc/backups/<backup-file>.dump \
QDOC_ROLLBACK_SHA=<known-good-sha> \
QDOC_ROLLBACK_APP_ARTIFACT_URI=s3://<private-bucket>/staging/<known-good-sha>/qdoc-app.tar.gz \
QDOC_ROLLBACK_OPS_BUNDLE_URI=s3://<private-bucket>/staging/<known-good-sha>/qdoc-ops.tar.gz \
QDOC_ROLLBACK_BACKUP_PATH=/opt/qdoc/backups/<known-good-backup-file>.dump \
bash deploy/release-evidence.sh
```

For final GO evidence, set `QDOC_EVIDENCE_STRICT=true` and mark each required package/status as `passed` with `QDOC_EVIDENCE_P5A_STATUS`, `QDOC_EVIDENCE_P5B_STATUS`, `QDOC_EVIDENCE_P5C_STATUS`, `QDOC_EVIDENCE_P5D_STATUS`, `QDOC_EVIDENCE_P5E_STATUS`, `QDOC_EVIDENCE_LOCAL_CHECKS_STATUS`, `QDOC_EVIDENCE_STAGING_VERIFIER_STATUS`, `QDOC_EVIDENCE_STAGING_REHEARSAL_STATUS`, `QDOC_EVIDENCE_BACKUP_RESTORE_CHECK_STATUS`, and `QDOC_EVIDENCE_MANUAL_SMOKE_STATUS`. If any value remains pending, the decision should remain `NO-GO`.

Set `QDOC_EVIDENCE_PRIVATE_OUTPUT=true` only for local/private release notes that will not be committed. Public or repository evidence should keep S3 bucket names, SSM command IDs, backup paths, operator identity, and free-form risk details redacted.

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
- Automated coverage includes patient OTP/check-in, staff OTP/queue operations, invalid/expired OTP states, refresh/revisit session continuity, notification preference persistence, almost-ready notification/outbox creation, failed notification job visibility, duplicate-delivery prevention, cancel, delay/restore, audit-log visibility, and map guardrail behavior.

No-go criteria:

- Any required check fails without a documented, accepted non-launch-blocking reason.
- E2E targets a shared staging or production database.
- A required launch setting is only present in local `.env` and not in the target environment.

## Staging Evidence

Run staging checks from `/opt/qdoc/current` or an equivalent deployment operator shell after the candidate artifact is deployed.

```bash
cd /opt/qdoc/current
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_VERIFY_OUTBOX=true \
QDOC_VERIFY_OPS=true \
QDOC_VERIFY_ADMIN_DATA=true \
QDOC_VERIFY_LAUNCH=true \
bash deploy/verify-staging.sh
```

Run the full rehearsal when the backup directory and public URL are configured:

```bash
cd /opt/qdoc/current
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_EXPECTED_RELEASE_SHA=<git-sha> \
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
- The staging staff/admin account is backed by a real OTP-receivable email through `QDOC_SEED_STAFF_ADMIN_EMAILS` or an approved membership operation.
- A tester email that is not on a site roster is expected to be denied staff access, and the evidence records the bootstrap or membership-management path used to authorize the actual staff tester email.
- The map provider is either intentionally disabled for a documented fail-closed test or fully configured with provider restrictions, QDoc monthly limits, usage reservations, and interactive map behavior.
- The operator records SSM command ID, app artifact SHA, ops bundle SHA, candidate source SHA, backup filename, and restore-check pass/fail without copying private logs or dump files into Git.

No-go criteria:

- Public URL is missing or points at a different artifact/release SHA.
- Backup restore-check has not passed for the launch database.
- `verify:admin-data` shows missing launch clinic, queue, expected staff admin, or map guardrail records.
- `verify:launch` reports console/fixed OTP enabled, missing SMTP, weak session secret, non-HTTPS app URL, public web bind, or map hard-stop misconfiguration in a launch-like environment.

## Manual Smoke Checks

Run these in staging after automated checks pass and real email delivery is approved.

1. Patient requests OTP, signs in, selects a launch clinic, checks in, and sees an active ticket.
2. Patient refreshes or reopens the app and remains in the expected authenticated/ticket state.
3. Patient grants location permission and sees the map centered near the current area; denial or browser block falls back cleanly.
4. Map supports pan/zoom controls, current-location recentering, marker click selection, selected marker/site highlighting, and card-to-map synchronization.
5. QDoc check-in sites are visually distinct from third-party provider discovery places.
6. Staff signs in at `/staff` with a site-scoped account and sees only authorized clinic queues.
7. Staff calls, starts, and completes the patient ticket; patient status updates through polling or SSE fallback behavior.
8. Staff delays and restores another eligible ticket; restored ticket returns to the front of the waiting queue.
9. Staff verifies queue open/close, notification threshold, membership management, and audit-log review.
10. Almost-ready notification work appears in operational checks without duplicate delivery.
11. User-facing OTP/map failures are readable and do not expose raw internal error codes such as `rate_limited`, `otp_delivery_unavailable`, `invalid_otp`, or `expired_otp`.

Go criteria:

- Patient and staff flows complete without invalid state transitions or authorization leaks.
- Portfolio visitors can understand the primary flow without separate developer instructions.
- Worker/outbox processing remains healthy after smoke checks.
- No OTPs, provider secrets, raw patient payloads, or database URLs appear in captured evidence.

## Manual Environment Work

Confirm these account-level and host-level items before go:

- DNS points the launch domain at the expected EC2 address.
- Security group exposes only approved public ports, normally `80` and `443`.
- Host Caddy proxies the launch domain to `127.0.0.1:${QDOC_WEB_PORT}`.
- `/opt/qdoc/shared/.env.staging` or production env contains HTTPS `APP_URL`, long `SESSION_SECRET`, SMTP settings, Redis URL, database URL, and disabled OTP debug flags.
- `/opt/qdoc/shared/.env.staging` contains real OTP-receivable `QDOC_SEED_STAFF_ADMIN_EMAILS` and matching verification expectations when staff smoke is required.
- GitHub OIDC role, S3 bucket lifecycle, SSM document, EC2 instance profile, and environment secrets are configured in the operating account.
- `/opt/qdoc/shared/deploy-bucket` contains only the trusted private deployment bucket name.
- S3 contains both the app artifact and matching ops bundle for the candidate SHA.
- Map provider remains disabled only for documented fail-closed testing, or provider-side restrictions, browser credential limits, server-side search credential restrictions, QDoc monthly hard-stop, and map/search usage rate limits are all configured.
- Database backup is copied to encrypted off-host storage and a restore-check has passed.
- Rollback app artifact, matching ops bundle, and matching backup are available before launch.

## Rollback Readiness

Before go, identify a known-good artifact and database backup.

```bash
aws ssm list-command-invocations --command-id <command-id> --details
aws s3 ls s3://<private-bucket>/staging/<known-good-sha>/
cd /opt/qdoc/current
docker compose -f compose.staging.yaml --env-file /opt/qdoc/shared/.env.staging ps
```

Rollback procedure:

1. Stop feature promotion and preserve current logs without exposing secrets.
2. Re-run the SSM deployment document for the known-good app artifact, ops bundle, and image tag.
3. Run `QDOC_PUBLIC_URL=https://qdoc.example.com bash deploy/verify-staging.sh`.
4. Restore the database only during an approved recovery window, using the documented `QDOC_RESTORE_CONFIRM=restore-qdoc` flow.
5. Re-run full staging verification and manual patient/staff smoke checks after rollback or restore.

No-go criteria:

- No known-good app artifact or matching ops bundle exists in S3.
- No matching database backup exists for a migration-bearing release.
- The release includes forward-only database changes whose rollback impact has not been reviewed.

## Decision Record

Use this block in the release notes or ticket:

```text
Decision: GO | NO-GO
Candidate SHA:
App artifact URI:
Ops bundle URI:
App artifact SHA-256:
Ops bundle SHA-256:
Staging URL:
P5-A Staff demo access:
P5-B Provider map public-browser:
P5-C OTP delivery and auth errors:
P5-D Public demo smoke:
P5-E Operations evidence:
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

For a portfolio public demo, do not choose `GO` if the map is only decorative, staff access depends on `staff@example.com`, first-time OTP attempts fail, or raw implementation errors are visible to visitors.

Also do not choose `GO` if the only tested staff path requires direct database edits, or if the only tested map path is the static/fallback rendering while provider-backed interaction is expected for the public demo.
