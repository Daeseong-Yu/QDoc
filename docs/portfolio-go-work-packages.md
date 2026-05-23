# Portfolio GO Work Packages

This document is the committed handoff for the newly defined portfolio-readiness work. It refines Step 5 of `qdoc-launch-candidate`; it does not create a new phase. The ignored `.ai/docs/portfolio-go-work-packages.md` file should mirror this content for local workflow state.

`GO` means QDoc can be presented as a public portfolio demo where a visitor can test the patient flow and an authorized tester can test staff operations without developer explanation, direct database edits, placeholder-only accounts, or visible internal implementation errors.

The latest portfolio-test clarification is that this site must support normal tester use for the documented QDoc flows. Future roadmap features remain out of scope, but documented patient, staff, map, OTP, queue, notification/outbox, refresh/revisit, membership, audit-log, backup, rollback, and staging verification paths cannot be left half-finished for `GO`.

Future roadmap items such as SMS, push, EMR/EHR integration, real travel-time estimates, multi-department operations, and a full clinic marketplace are out of scope for this gate.

## Current Status

Step 5 remains in progress. Local implementation and automated coverage exist for large parts of the gate, but portfolio `GO` is still blocked until staging/manual evidence is collected with real external systems.

The newly defined work has been written into the required durable and active handoff documents. Future sessions should treat this file, its `.ai/docs` mirror, `.ai/execution/current.md`, and `.ai/phases/qdoc-launch-candidate/step5.md` as the active source of task order and package status. Core docs keep the product and architecture boundaries; `AGENTS.md` keeps future-session rules such as commit review, `.ai` handling, and portfolio GO interpretation.

Documentation coverage for this newly defined work:

- `.ai/core/PRD.md` defines the portfolio-demo product scope and final success criteria.
- `.ai/core/ARCHITECTURE.md` defines the implementation boundaries for staff access, provider maps, OTP, deployment, and operations.
- `.ai/core/ADR.md` records the durable `GO` gate, staff bootstrap, provider-map, and evidence decisions.
- `.ai/phases/index.json` and `.ai/phases/qdoc-launch-candidate/index.json` keep the launch-candidate task and P5-A through P5-E package list discoverable.
- `.ai/execution/current.md` keeps the active status snapshot and next-action guidance.
- `.ai/phases/qdoc-launch-candidate/step5.md` keeps the active acceptance criteria, implementation order, and verification expectations.
- `AGENTS.md` keeps the future-session rules so Step 5 work does not depend on chat history.

Do not close a package for `GO` from local tests alone when the behavior depends on:

- real OTP-receivable inboxes
- configured SMTP delivery
- real map provider credentials and restrictions
- public browser geolocation and provider SDK behavior
- deployed host/Caddy/SSM settings
- backup restore-checks
- rollback artifacts

## Execution Boundaries

Use these packages as the implementation, verification, and commit-unit boundaries for the rest of Step 5. Keep three states separate for each package:

- Local implementation and automated coverage: code, UI, scripts, and local E2E or verifier proof.
- Staging/manual evidence: real public URL, real inboxes, real provider credentials/restrictions, deployed worker behavior, backup restore-check, or rollback artifact proof.
- Release decision status: `GO`, `NO-GO`, or accepted non-public-demo risk recorded safely.

The default execution order is P5-A, P5-B, P5-C, P5-D, then P5-E. If staging/manual evidence exposes a product gap, return to implementation in that same package before continuing evidence collection.

Do not mark a package complete for `GO` from local tests alone when the package depends on real email delivery, public-browser provider behavior, deployed host settings, backup restore-checks, or rollback artifacts.

If staging/manual evidence cannot be collected because the candidate has not been pushed, deployed, or configured with real SMTP, staff tester inboxes, map provider credentials, provider restrictions, backup storage, or rollback artifacts, record that prerequisite explicitly and continue only with local implementation or documentation work that reduces the relevant package blocker. Do not repeatedly retry external commands after approval or environment failures.

## Active Completion Rules

These rules capture the newly defined product-completion expectations for future work:

- P5-A remains open until a real OTP-receivable staff/admin and tester path is proven without direct database edits. Signing in with an unrostered personal email should fail authorization; the fix is to roster that exact tester email through bootstrap or membership management.
- P5-B remains open until the public map is proven as an interactive provider-backed experience. Seeded QDoc clinics are the check-in source of truth, but they are not enough for nearby healthcare discovery by themselves.
- P5-C remains open until first-time staging OTP delivery, readable delivery/rate-limit/invalid/expired states, and refresh/revisit session behavior are proven against the deployed environment.
- P5-D remains open until the patient and staff demo paths can be exercised from the UI and checklist alone, including queue operations, notification/outbox behavior, membership management, and audit-log review.
- P5-E remains open until staging verifier, rehearsal, backup restore-check, rollback target, and safe GO/NO-GO evidence are recorded.

Do not downgrade one of these requirements to an accepted risk unless the user explicitly decides that the behavior is outside the public portfolio demo.

Treat tester-facing usability gaps as implementation work. A map that renders but does not pan, zoom, recenter, or synchronize selection; staff access that only works after hidden database edits; OTP failures that expose raw API codes; or smoke steps that require developer explanation are blockers in their related P5 package.

## Pre-GO Functional Completion List

This is the concrete task list that remains before `GO`. It is broader than deployment success and narrower than the future product roadmap.

1. Staff access
   - Prepare real OTP-receivable staff/admin access.
   - Prepare or add a real tester email through bootstrap or membership management.
   - Verify unauthorized personal emails remain blocked with readable copy.
2. Map experience
   - Prove provider-backed map loading in a public browser.
   - Verify browser-geolocation centering, pan/zoom, current-location recentering, marker/card synchronization, selected-state feedback, and QDoc-vs-provider discovery distinction.
   - Verify disabled, denied-location, missing-credential, and over-budget states fail closed without internal cost-guard labels.
3. OTP and session behavior
   - Prove first-time staging OTP delivery for patient and staff paths.
   - Verify readable delivery-unavailable, rate-limited, invalid-code, expired-code, and unauthorized-staff messages.
   - Verify refresh/revisit session behavior on the deployed host.
4. Patient public demo smoke
   - Complete visitor-style OTP sign-in, map discovery, clinic/queue selection, check-in, active ticket viewing, notification preference review, refresh, and revisit.
5. Staff public demo smoke
   - Complete tester-style staff sign-in, site authorization, queue board use, call/start/complete, delay/restore, cancel, queue open/close, notification threshold, membership management, audit-log review, and role boundary checks.
6. Notification and outbox proof
   - Verify almost-ready notification generation, outbox processing, failed-job visibility, and duplicate-delivery prevention against the deployed worker.
7. Operations proof
   - Record staging verifier, staging rehearsal, backup restore-check, rollback target, safe evidence identifiers, known risks, and explicit GO/NO-GO decision.

## Work Packages

Completion standard: a work package is not done only because the code path exists. It is done when the intended visitor or tester can execute the documented workflow in staging without developer explanation, direct database edits, placeholder-only accounts, or raw implementation errors. If evidence collection finds a gap, return to implementation in that package and update the status here.

### P5-A Staff Demo Access

Outcome: staging has at least one real OTP-receivable staff/admin account and a tester authorization path that does not require direct database edits.

Implementation state:

- Seed/bootstrap supports expected staff/admin emails.
- Existing staging databases can add or promote real staff/admin emails with `deploy/bootstrap-staff-admins.sh` or `pnpm db:bootstrap-staff-admins:staging` without rerunning the full seed, resetting tickets, changing queues, or changing map guardrail rows.
- Launch/admin-data verification can assert staff/admin readiness without printing addresses.
- Local E2E proves an admin-created staff tester membership path and role boundaries.

Remaining evidence:

- Configure a real staff/admin inbox through `QDOC_SEED_STAFF_ADMIN_EMAILS`, `QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS`, or admin membership management.
- For an already-deployed staging database, run the staff-admin bootstrap first in dry-run mode, then apply it only after confirming the target site count. The command output must remain safe and must not print real email addresses.
- Verify the expected staff/admin account with `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS`, then record `QDOC_SMOKE_STAFF_ADMIN_DATA=passed` only when the staging admin-data verifier passed without printing the address.
- Sign in at `/staff` using a real inbox.
- Add or verify a tester membership through the UI.
- Confirm an unrostered personal email is denied staff access with readable copy.

Verification:

- `pnpm verify:admin-data`
- `pnpm verify:launch`
- `QDOC_BOOTSTRAP_STAFF_DRY_RUN=true QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" pnpm db:bootstrap-staff-admins`
- `bash deploy/bootstrap-staff-admins.sh` from the deployed release when applying approved staging staff/admin access
- staff membership E2E or manual staging smoke
- `QDOC_SMOKE_STAFF_ADMIN_DATA=passed bash deploy/portfolio-smoke-evidence.sh` as part of the P5-A smoke rollup after staging verification
- safe release evidence that does not disclose real email addresses unless explicitly approved

### P5-B Provider Map Public-Browser Verification

Outcome: the public patient map behaves like an interactive provider-backed map when enabled and fails closed when provider access, usage budget, credentials, or browser permission are unavailable.

Implementation state:

- Local provider map interaction is implemented.
- Marker/card synchronization, accessible selected-state feedback, current-location recentering, Refresh-triggered provider retry, and hidden internal guardrail copy are covered locally.
- Disabled-provider fallback now supports visible marker selection, zoom controls, current-location recentering, and patient-readable copy so the fail-closed state is still usable during local or guarded verification.
- Local E2E uses a stubbed provider SDK/cache path to avoid paid provider traffic.
- Public browser Playwright smoke is available through `pnpm e2e:portfolio`. It is read-only, requires `QDOC_PUBLIC_URL` or `QDOC_PORTFOLIO_BASE_URL`, and can require provider-backed map behavior with `QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true`. Strict provider mode now fails unless browser geolocation is available, the provider map reaches ready state, at least one QDoc clinic marker is present, at least one provider nearby discovery place is rendered, and the app-level current-location recenter control calls the live provider map. The smoke also asserts clinic-card/marker selected-state feedback and fallback zoom/recenter viewport changes so a map that renders but does not respond to interaction remains a blocker.

Remaining evidence:

- Configure provider-side restrictions, quotas, and billing alerts.
- Configure QDoc monthly hard stops for `map_load` and `places_search`.
- Verify public browser credentials and server-side search credentials where used.
- Confirm geolocation-centered loading, pan/zoom, recentering, marker/card sync, QDoc-vs-provider visual distinction, denied-location fallback, and over-budget fallback in staging.

Verification:

- targeted/full Playwright E2E locally
- fallback map E2E for disabled-provider zoom, recenter, and selection behavior
- `QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true pnpm e2e:portfolio`
- staging manual public-browser smoke
- `pnpm verify:ops`
- `pnpm verify:admin-data`

### P5-C OTP Delivery And Auth Error Usability

Outcome: first-time patient and staff OTP requests work in staging, and common auth failures are understandable to visitors and staff testers.

Implementation state:

- Local UI renders readable delivery-unavailable, rate-limit, invalid-code, expired-code, unauthorized-staff, and retry states.
- Local E2E verifies patient and staff error rendering without exposing raw internal codes.
- Session continuity across refresh/revisit is covered locally.
- `pnpm verify:email` safely checks API OTP delivery policy, worker provider policy, SMTP config shape, placeholder SMTP values, and optional SMTP connectivity/auth without sending email or printing provider diagnostics.
- `deploy/verify-staging.sh` can run the same check from the staging worker image with `QDOC_VERIFY_EMAIL=true`; `QDOC_VERIFY_SMTP_CONNECTIVITY=true` adds an approved live SMTP `verify()` connection.

Remaining evidence:

- Verify first-time OTP delivery with staging SMTP settings.
- Verify `pnpm verify:email` or `QDOC_VERIFY_EMAIL=true bash deploy/verify-staging.sh` passes with the deployed staging env, and use `QDOC_VERIFY_SMTP_CONNECTIVITY=true` when SMTP connectivity/auth should be tested before requesting a real OTP.
- Verify real inbox receipt for patient and staff paths.
- Verify delivery-unavailable behavior without leaking SMTP/provider diagnostics.
- Verify refresh/revisit behavior on the deployed host.

Verification:

- local OTP/session E2E
- `pnpm verify:email`
- `QDOC_VERIFY_EMAIL=true bash deploy/verify-staging.sh`
- staging manual smoke with real SMTP settings
- release evidence that excludes OTP values and provider diagnostics

### P5-D Public Demo Smoke

Outcome: a visitor can test the patient path and an authorized tester can test the staff path without external explanation.

Implementation state:

- Local automated coverage includes notification preference persistence, almost-ready notification/outbox creation, failed-job visibility, cancel flow, audit-log refresh, duplicate almost-ready prevention, and core queue operations.
- Read-only public browser smoke covers patient page load, Refresh usability, clinic selection, marker selection, selected-state feedback, map fallback/provider surface expectations, `/staff` sign-in surface reachability, and absence of raw internal errors in the public UI. It does not request OTPs or prove staff authorization.
- `deploy/portfolio-smoke-evidence.sh` and `pnpm verify:portfolio-smoke` provide a read-only helper for converting P5-A through P5-D manual smoke outcomes into safe package status exports for `deploy/release-evidence.sh`.

Remaining evidence:

- Patient smoke: OTP sign-in, geolocation-centered discovery, clinic/queue selection, check-in, active ticket state, refresh/revisit continuity, notification preferences, and readable fallback states.
- Staff smoke: OTP sign-in, authorized site selection, call/start/complete, delay/restore, cancel, queue open/close, notification threshold, membership management, audit-log review, and role boundary checks.
- Worker smoke: almost-ready notification generation, outbox processing, failed-job visibility, and duplicate-delivery prevention on the deployed worker.

Verification:

- `pnpm e2e`
- `QDOC_PUBLIC_URL=https://qdoc.example.com pnpm e2e:portfolio`
- `pnpm verify:portfolio-smoke`
- staging manual patient/staff smoke
- `pnpm verify:outbox`
- `pnpm verify:ops`

### P5-E Operations Evidence And Decision

Outcome: staging verification, full rehearsal, backup restore-check, rollback target, safe evidence, and explicit GO/NO-GO decision are recorded.

Implementation state:

- `docs/release-go-no-go.md` contains the release checklist.
- `deploy/release-evidence.sh` and `pnpm verify:release-evidence` provide a read-only evidence preflight and redacted decision-record block.
- `deploy/portfolio-smoke-evidence.sh` and `pnpm verify:portfolio-smoke` provide the manual P5-A through P5-D smoke status rollup that feeds the release evidence preflight.
- Staging rehearsal and release evidence use `QDOC_EXPECTED_APP_IMAGE=qdoc-app:<40-character-git-sha>` as the candidate image, so the shared staging env file can retain its deploy-time `QDOC_APP_IMAGE` placeholder.

Remaining evidence:

- Candidate SHA, app artifact, ops bundle, checksums, and SSM command status.
- Staging verifier and full rehearsal status.
- Backup restore-check result.
- Rollback target SHA, app artifact, ops bundle, and backup reference.
- P5-A through P5-D package statuses.
- Known risks and explicit GO/NO-GO decision.

Verification:

- `deploy/portfolio-smoke-evidence.sh`
- `deploy/verify-staging.sh`
- `deploy/staging-rehearsal.sh`
- backup restore-check command
- `pnpm verify:release-evidence`
- `python3 .ai/scripts/validate_workflow.py`
- `python3 .ai/scripts/execute.py qdoc-launch-candidate --check`

## Implementation Order

Use this order unless the user's latest instruction changes priority:

1. P5-A Staff demo access staging/manual evidence
2. P5-B Provider map public-browser verification
3. P5-C First-time OTP delivery and auth/session staging verification
4. P5-D Full public demo smoke
5. P5-E Operations evidence and GO/NO-GO decision

If staging/manual evidence reveals a product gap, fix that gap as part of the relevant package before moving forward.

## Documentation Sync

When a work package is completed, redefined, or blocked by a new product/operational decision, update:

1. `docs/portfolio-go-work-packages.md`
2. `.ai/docs/portfolio-go-work-packages.md`
3. `.ai/execution/current.md`
4. `.ai/phases/qdoc-launch-candidate/step5.md`
5. `.ai/core/PRD.md` for user-visible product scope changes
6. `.ai/core/ARCHITECTURE.md` for API, data, provider, deployment, or operational behavior changes
7. `.ai/core/ADR.md` for durable decisions and trade-offs
8. `AGENTS.md` for rules future Codex sessions must follow
9. `docs/release-go-no-go.md` or README for tester/operator procedure changes

The `.ai/` files are local workflow state in this repository. Keep them current for execution continuity, but do not force-add or commit ignored `.ai` files unless the user explicitly asks and the diff has been reviewed for local paths, private host details, secrets, OTP values, provider/account identifiers, and operational evidence that should stay private.

Do not record secrets, OTP values, private logs, raw patient payloads, provider credentials, database dumps, raw connection strings, or private operational identifiers in repository-safe evidence.
