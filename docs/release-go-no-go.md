# QDoc Portfolio Release Go/No-Go

Use this checklist for a portfolio-ready launch-candidate decision. `GO` means QDoc can be presented publicly as a portfolio demo where visitors can test the main workflows without developer explanation. Record command status, short safe summaries, commit SHAs, artifact identifiers, and operator notes. Do not paste secrets, OTP codes, database dumps, private deployment logs, patient payloads, or raw connection strings into the evidence.

Do not start final GO evidence collection while known portfolio blockers remain open. At minimum, finish the interactive provider map, first-time OTP delivery, real staff/admin demo access, user-friendly auth/map error handling, patient/staff smoke path, notification/outbox health, backup restore-check, rollback target, and staging rehearsal.

Current GO gate policy: treat this checklist as the final evidence record after the product-completion work is done, not as a substitute for that work. A successful deployment, visible staff page, rendered fallback map, or local-only E2E proof is not enough for `GO` while the deployed portfolio user cannot complete the documented staff, map, OTP, patient, notification/outbox, backup, rollback, and decision paths.

Track remaining evidence by Step 5 work package:

1. P5-A Staff demo access
2. P5-B Provider map public-browser verification
3. P5-C OTP delivery and auth error usability
4. P5-D Public demo smoke
5. P5-E Operations evidence and decision

The package-level source of truth for this newly defined work is `docs/portfolio-go-work-packages.md`, with `.ai/docs/portfolio-go-work-packages.md` maintained as the local workflow mirror. Keep this checklist focused on release evidence and decision records; keep package status, implementation order, and handoff details synchronized in the handoff documents.

Do not mark a package complete from local tests alone when it depends on real inboxes, real provider credentials, public browser restrictions, deployed host settings, backup restore-checks, or rollback artifacts.

Before using this checklist for final evidence, confirm the release candidate is the one being served publicly: read the SHA with `git rev-parse HEAD`, ensure that commit has been pushed and deployed, and require `/api/release` to match it. If that prerequisite is missing, leave the relevant package evidence as `pending` and do not replace it with local-only proof.

If any evidence step shows that a visitor or invited tester cannot complete a documented workflow from the UI and checklist alone, stop treating the release as evidence-only work. Return to the relevant P5 package, fix the implementation or documentation gap, and rerun the affected checks before recording a GO/NO-GO decision.

## Work Package Evidence

Fill this table for each release candidate. Keep the notes safe: use short summaries, commit SHAs, command names, and pass/fail outcomes; do not paste secrets, OTPs, private logs, raw patient payloads, provider credentials, or connection strings.

| Package | Required proof | Current status | Evidence location |
| --- | --- | --- | --- |
| P5-A Staff demo access | Real OTP-receivable staff/admin access, tester authorization path, unauthorized personal email denial | Staff-admin bootstrap utility exists locally; pending staging/manual proof | `<link-or-note>` |
| P5-B Provider map public-browser | Geolocation-centered provider map, pan or native drag, zoom, recentering, marker/card sync, QDoc-vs-provider distinction, fail-closed states | Local pan/zoom/recenter/selection proof exists; staging/manual proof is pending | `<link-or-note>` |
| P5-C OTP delivery and auth errors | First-time SMTP delivery, readable retry/delivery/invalid/expired states, refresh/revisit session behavior | Pending staging/manual proof | `<link-or-note>` |
| P5-D Public demo smoke | Patient/staff/queue/notification/outbox/membership/audit-log/map path tested as a visitor/tester | Local automated coverage and smoke-evidence rollup helper exist; staging/manual proof pending | Local: `pnpm e2e`, `pnpm e2e:portfolio`, and `pnpm verify:portfolio-smoke`; staging: `<link-or-note>` |
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

Before copying this section into the final decision record, run the read-only evidence preflight. It does not call AWS, Docker, SMTP, map providers, or the public site; it only checks provided identifiers and prints a commit-safe decision-record block with private operational identifiers redacted by default after blocking validation passes.

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

For final GO evidence, set `QDOC_EVIDENCE_STRICT=true` and mark each required package/status as `passed` with `QDOC_EVIDENCE_P5A_STATUS`, `QDOC_EVIDENCE_P5B_STATUS`, `QDOC_EVIDENCE_P5C_STATUS`, `QDOC_EVIDENCE_P5D_STATUS`, `QDOC_EVIDENCE_P5E_STATUS`, `QDOC_EVIDENCE_LOCAL_CHECKS_STATUS`, `QDOC_EVIDENCE_STAGING_VERIFIER_STATUS`, `QDOC_EVIDENCE_STAGING_REHEARSAL_STATUS`, `QDOC_EVIDENCE_BACKUP_RESTORE_CHECK_STATUS`, and `QDOC_EVIDENCE_MANUAL_SMOKE_STATUS`. If any value remains pending, the decision should remain `NO-GO`. The release evidence preflight also fails `QDOC_GO_NO_GO_DECISION=GO` unless all of these statuses are `passed`, even when strict mode was not enabled.

Set `QDOC_EXPECTED_APP_IMAGE=qdoc-app:<git-sha>` explicitly for release evidence. `/opt/qdoc/shared/.env.staging` may intentionally keep `QDOC_APP_IMAGE="qdoc-app:replace-with-git-sha"` because the deployment and rehearsal scripts export the actual candidate image at runtime.

Set `QDOC_EVIDENCE_PRIVATE_OUTPUT=true` only for local/private release notes that will not be committed. Public or repository evidence should keep S3 bucket names, SSM command IDs, backup paths, operator identity, and free-form risk details redacted.

When changing the release evidence guard, run the local self-test before relying on the decision block. It does not call AWS, Docker, SMTP, map providers, the public site, or the database.

```bash
pnpm verify:release-evidence:self-test
```

When changing the portfolio smoke rollup, run its local self-test before relying on package status exports. It uses fake status values and does not call AWS, Docker, SMTP, map providers, the public site, or the database.

```bash
pnpm verify:portfolio-smoke:self-test
```

Before setting the P5-A through P5-D status variables, use the portfolio smoke helper to roll up the manual browser/inbox checks into package statuses. The helper is read-only and does not call AWS, Docker, SMTP, map providers, or the public site. It validates the status values you provide and prints export lines for `deploy/release-evidence.sh`.

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_SMOKE_PUBLIC_RELEASE_PREFLIGHT=passed \
QDOC_SMOKE_PUBLIC_BROWSER_SMOKE=passed \
QDOC_SMOKE_STAFF_ADMIN_DATA=passed \
QDOC_SMOKE_STAFF_ADMIN_SIGNIN=passed \
QDOC_SMOKE_STAFF_TESTER_AUTH=passed \
QDOC_SMOKE_STAFF_TESTER_MEMBERSHIP=passed \
QDOC_SMOKE_STAFF_ROLE_BOUNDARY=passed \
QDOC_SMOKE_UNROSTERED_STAFF_DENIAL=passed \
QDOC_SMOKE_PROVIDER_RESTRICTIONS=passed \
QDOC_SMOKE_MAP_GEO_CENTER=passed \
QDOC_SMOKE_MAP_PAN_ZOOM=passed \
QDOC_SMOKE_MAP_RECENTER=passed \
QDOC_SMOKE_MARKER_CARD_SYNC=passed \
QDOC_SMOKE_QDOC_PROVIDER_DISTINCTION=passed \
QDOC_SMOKE_MAP_FAIL_CLOSED=passed \
QDOC_SMOKE_PATIENT_OTP_DELIVERY=passed \
QDOC_SMOKE_STAFF_OTP_DELIVERY=passed \
QDOC_SMOKE_AUTH_ERROR_COPY=passed \
QDOC_SMOKE_SESSION_REVISIT=passed \
QDOC_SMOKE_PATIENT_CHECKIN=passed \
QDOC_SMOKE_PATIENT_STATUS_REVISIT=passed \
QDOC_SMOKE_STAFF_QUEUE_OPS=passed \
QDOC_SMOKE_STAFF_QUEUE_CONTROLS=passed \
QDOC_SMOKE_MEMBERSHIP_AUDIT=passed \
QDOC_SMOKE_AUDIT_LOG_REVIEW=passed \
QDOC_SMOKE_NOTIFICATION_OUTBOX=passed \
QDOC_SMOKE_WORKER_DUPLICATE_GUARD=passed \
QDOC_SMOKE_STRICT=true \
bash deploy/portfolio-smoke-evidence.sh
```

Use `pending`, `not_run`, or `failed` for checks that are not actually proven. Do not mark a value `passed` from local tests when the check depends on real inboxes, a public browser, provider credentials, deployed worker behavior, or staging host settings. The helper includes `QDOC_SMOKE_PUBLIC_RELEASE_PREFLIGHT` and `QDOC_SMOKE_PUBLIC_BROWSER_SMOKE` in the P5-B and P5-D rollups, so stale public deployments or skipped Playwright public smoke cannot be hidden by manual package statuses. The membership, role-boundary, queue-control, patient status revisit, and audit-log values are separate because a portfolio tester must be able to prove those UI paths without relying on a developer explanation or direct database edits.

Run the read-only public release preflight before browser smoke. It checks only `/api/health` and `/api/release`; use it to catch stale public deployments before collecting Playwright evidence.

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_EXPECTED_RELEASE_SHA=<git-sha> \
pnpm verify:public-release
```

Run the read-only public browser smoke against the deployed URL before marking P5-B or P5-D browser checks complete. Use provider strict mode only when the map provider should be live for the candidate. In strict provider mode, the smoke requires granted browser geolocation, a ready provider map, at least one QDoc clinic marker, at least one provider nearby discovery place, and app-level provider pan/zoom/recenter responses; if the chosen coordinates have no provider results, use `QDOC_PORTFOLIO_GEO_LATITUDE` and `QDOC_PORTFOLIO_GEO_LONGITUDE` for a known service area.

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_PORTFOLIO_EXPECT_RELEASE_SHA=<git-sha> \
QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true \
pnpm e2e:portfolio
```

This public browser smoke first compares the expected 40-character candidate SHA with `/api/release`, then checks the patient page, patient OTP-entry surface, map controls including pan/zoom/recenter, Refresh/site-selection behavior, marker selected-state feedback, `/staff` sign-in surface plus roster guidance, and absence of raw internal API/error tokens without database writes or OTP requests. It does not replace first-time inbox delivery, staff authorization, queue operation, worker/outbox, backup, or rollback evidence.

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
pnpm verify:email
pnpm verify:portfolio-smoke:self-test
pnpm verify:release-evidence:self-test
pnpm e2e
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_EXPECTED_RELEASE_SHA=<git-sha> pnpm verify:public-release
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_PORTFOLIO_EXPECT_RELEASE_SHA=<git-sha> QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true pnpm e2e:portfolio
git diff --check
```

Go criteria:

- Every command exits zero.
- `verify:ops` has no stale processing outbox jobs, failed notification jobs, failed almost-ready email jobs, or map guardrail attention states.
- `verify:launch` reports launch-like hardening ready for the target environment when staging or production env is loaded.
- `verify:email` reports API OTP delivery policy, worker delivery policy, SMTP config shape, placeholder-value checks, and any approved SMTP connectivity check as ready without printing SMTP credentials, provider diagnostics, OTP values, or recipient addresses.
- E2E runs against a local or explicitly isolated test database only.
- No local-only config, `.env`, backup, screenshot, trace, or generated secret material is staged.
- Automated coverage includes patient OTP/check-in, staff OTP/queue operations, invalid/expired OTP states, refresh/revisit session continuity, notification preference persistence, almost-ready notification/outbox creation, failed notification job visibility, duplicate-delivery prevention, cancel, delay/restore, audit-log visibility, and map guardrail behavior.
- Public release preflight passes before public browser smoke, proving the URL is healthy and serving the expected candidate SHA.
- Public browser smoke passes against the candidate URL when the public domain and provider credentials are expected to be live.

No-go criteria:

- Any required check fails without a documented, accepted non-launch-blocking reason.
- E2E targets a shared staging or production database.
- A required launch setting is only present in local `.env` and not in the target environment.
- `/api/release` is missing, invalid, or does not match the expected candidate SHA when public smoke evidence is required.

## Staging Evidence

Run staging checks from `/opt/qdoc/current` or an equivalent deployment operator shell after the candidate artifact is deployed.

For P5-A on an existing staging database, add or promote the real staff/admin inbox without rerunning the full seed. The deploy helper dry-runs by default unless `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply` is set. Run dry-run first and do not copy real email addresses into repository evidence:

```bash
cd /opt/qdoc/current
QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" \
bash deploy/bootstrap-staff-admins.sh

QDOC_BOOTSTRAP_STAFF_CONFIRM=apply \
QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" \
bash deploy/bootstrap-staff-admins.sh
```

```bash
cd /opt/qdoc/current
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_VERIFY_OUTBOX=true \
QDOC_VERIFY_OPS=true \
QDOC_VERIFY_ADMIN_DATA=true \
QDOC_VERIFY_LAUNCH=true \
QDOC_VERIFY_EMAIL=true \
bash deploy/verify-staging.sh
```

For P5-C SMTP diagnostics, add live SMTP connectivity/auth verification only when the staging provider is allowed to accept a connection from the deployed host. This does not send an OTP and does not replace real inbox smoke:

```bash
cd /opt/qdoc/current
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_VERIFY_EMAIL=true \
QDOC_VERIFY_SMTP_CONNECTIVITY=true \
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

Use the 40-character candidate Git SHA in both `QDOC_EXPECTED_RELEASE_SHA` and the `qdoc-app:<git-sha>` image tag. Do not type the literal `<git-sha>` placeholder. The rehearsal script exports `QDOC_APP_IMAGE` from `QDOC_EXPECTED_APP_IMAGE`, so the shared staging env file does not need to be edited for each release. If you run `docker compose` manually outside the deployment or rehearsal scripts, pass `QDOC_APP_IMAGE=qdoc-app:<git-sha>` in the command environment or Docker Compose will try to use the placeholder image.

Go criteria:

- Compose services are healthy and only web is bound to host loopback.
- Public Caddy route returns success for the expected domain.
- Outbox, ops, admin-data, launch-hardening, backup restore-check, and bounded drill checks exit zero.
- Email verification exits zero and does not report `smtp_config_incomplete`, `placeholder_smtp_values_detected`, `smtp_required_for_launch`, `console_delivery_not_allowed`, or SMTP connectivity failure when live connectivity is requested.
- The staging staff/admin account is backed by a real OTP-receivable email through `QDOC_SEED_STAFF_ADMIN_EMAILS` or an approved membership operation.
- P5-A smoke status uses `QDOC_SMOKE_STAFF_ADMIN_DATA=passed` only after `verify:admin-data` passed with `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS` configured for the real staff/admin inbox.
- A tester email that is not on a site roster is expected to be denied staff access, and the evidence records the bootstrap or membership-management path used to authorize the actual staff tester email.
- The map provider is either intentionally disabled for a documented fail-closed test or fully configured with provider restrictions, QDoc monthly limits, usage reservations, and interactive map behavior.
- The operator records SSM command ID, app artifact SHA, ops bundle SHA, candidate source SHA, backup filename, and restore-check pass/fail without copying private logs or dump files into Git.

No-go criteria:

- Public URL is missing or points at a different artifact/release SHA.
- Backup restore-check has not passed for the launch database.
- `verify:admin-data` shows missing launch clinic, queue, expected staff admin, or map guardrail records.
- `verify:launch` reports console/fixed OTP enabled, missing SMTP, weak session secret, non-HTTPS app URL, public web bind, or map hard-stop misconfiguration in a launch-like environment.
- `verify:email` reports that the API or worker would fail OTP/email delivery, SMTP values are placeholders, or approved SMTP connectivity/auth verification fails.

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
11. User-facing OTP/map/staff failures are readable and do not expose raw internal error codes such as `rate_limited`, `otp_delivery_unavailable`, `invalid_otp`, `expired_otp`, `map_provider_disabled`, `map_budget_exhausted`, `queue_closed`, `invalid_request`, `invalid_transition`, `internal_error`, `not_found`, or raw JSON auth tokens such as `"unauthorized"` or `"forbidden"`.

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
- If the staging database already has demo tickets or reviewed map settings, prefer `QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS` plus `deploy/bootstrap-staff-admins.sh` to add or promote staff/admin access without resetting that data. Run dry-run first; production-like apply requires `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply`.
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
