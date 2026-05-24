# Portfolio GO Work Packages

This document is the committed handoff for the newly defined portfolio-readiness work. It refines Step 5 of `qdoc-launch-candidate`; it does not create a new phase. The ignored `.ai/docs/portfolio-go-work-packages.md` file should mirror this content for local workflow state.

`GO` means QDoc can be presented as a public portfolio demo where a visitor can test the patient flow and an authorized tester can test staff operations without developer explanation, direct database edits, placeholder-only accounts, or visible internal implementation errors.

The latest portfolio-test clarification is that this site must support normal tester use for the documented QDoc flows. Future roadmap features remain out of scope, but documented patient, staff, map, OTP, queue, notification/outbox, refresh/revisit, membership, audit-log, backup, rollback, and staging verification paths cannot be left half-finished for `GO`.

Future roadmap items such as SMS, push, EMR/EHR integration, real travel-time estimates, multi-department operations, and a full clinic marketplace are out of scope for this gate.

## Current Status

Step 5 remains in progress. Local implementation and automated coverage exist for large parts of the gate, but portfolio `GO` is still blocked until staging/manual evidence is collected with real external systems.

Current GO gate policy: this document is the active pre-GO product-completion board. It should make clear that the remaining work is not only deployment validation or a plan for the next small step. Staff access, provider-backed map interaction, first-time OTP delivery, public patient/staff smoke, notification/outbox proof, backup/rollback proof, and safe release evidence must all close before `GO` unless the user explicitly excludes a path from the public demo.

The newly defined work has been written into the required durable and active handoff documents. Future sessions should treat this file, its `.ai/docs` mirror, `.ai/execution/current.md`, and `.ai/phases/qdoc-launch-candidate/step5.md` as the active source of task order and package status. Core docs keep the product and architecture boundaries; `AGENTS.md` keeps future-session rules such as commit review, `.ai` handling, and portfolio GO interpretation.

Documentation coverage for this newly defined work:

- `.ai/core/PRD.md` defines the portfolio-demo product scope and final success criteria.
- `.ai/core/ARCHITECTURE.md` defines the implementation boundaries for staff access, provider maps, OTP, deployment, and operations.
- `.ai/core/ADR.md` records the durable `GO` gate, staff bootstrap, provider-map, and evidence decisions.
- `.ai/phases/index.json` and `.ai/phases/qdoc-launch-candidate/index.json` keep the launch-candidate task and P5-A through P5-E package list discoverable.
- `.ai/execution/current.md` keeps the active status snapshot and next-action guidance.
- `.ai/phases/qdoc-launch-candidate/step5.md` keeps the active acceptance criteria, implementation order, and verification expectations.
- `docs/release-go-no-go.md` keeps the operator-facing evidence checklist and safe decision-record fields.
- `AGENTS.md` keeps the future-session rules so Step 5 work does not depend on chat history.
- `README.md` summarizes the active portfolio gate for developers/operators and links back to this package handoff and the release checklist.

Resume from these documents in this order when continuing the newly defined work:

1. `.ai/execution/current.md` for the latest active status snapshot and current blockers.
2. `.ai/phases/qdoc-launch-candidate/step5.md` for the active Step 5 acceptance criteria, implementation order, and package closure rules.
3. This document and `.ai/docs/portfolio-go-work-packages.md` for P5-A through P5-E local state, staging/manual evidence, and verification commands.
4. `docs/release-go-no-go.md` for the operator-facing evidence checklist and safe decision-record fields.
5. `AGENTS.md` for future-session rules, commit review policy, `.ai` handling, and portfolio `GO` interpretation.

The next work item should be selected from the first P5 package whose tester-facing product path or required staging/manual proof is still missing. Do not move directly from local automated coverage to `GO`.

Do not close a package for `GO` from local tests alone when the behavior depends on:

- real OTP-receivable inboxes
- configured SMTP delivery
- real map provider credentials and restrictions
- public browser geolocation and provider SDK behavior
- deployed host/Caddy/SSM settings
- backup restore-checks
- rollback artifacts

Latest documentation-sync rule: when the work board changes, update this file for package-level handoff, `.ai/docs/portfolio-go-work-packages.md` as its local mirror, `.ai/execution/current.md` and `.ai/phases/qdoc-launch-candidate/step5.md` for active status, `.ai/core` for durable product or architecture decisions, `docs/release-go-no-go.md` for operator evidence procedures, and `AGENTS.md` only for future-session rules. Do not start a new phase or move the work out of Step 5 unless the user explicitly changes that direction.

Volatile candidate values such as the current release SHA belong in `.ai/execution/current.md` and the active Step 5 status block, not as durable package definitions in this committed handoff. Before public release preflight or portfolio smoke, read the current SHA with `git rev-parse HEAD` and update the active `.ai` status if it has changed.

Current documentation ownership: this document owns the P5-A through P5-E package definitions, local/staging evidence boundaries, and package-level verification commands. It should not store one-off staging logs, OTP values, private host details, bucket names, provider identifiers, real tester email addresses, or volatile candidate evidence. Use `docs/release-go-no-go.md` for safe operator evidence and `.ai/execution/current.md` for the latest active status snapshot.

Latest documentation-fill result: the newly defined work is filled into `.ai/core`, `.ai/phases`, `.ai/execution/current.md`, this committed handoff, the `.ai/docs` mirror, `docs/release-go-no-go.md`, `AGENTS.md`, and the README portfolio gate summary. Continue updating by ownership instead of copying every implementation detail into every document. This document remains the package-level source of truth; active candidate SHA, one-off staging results, and private operational details belong in active execution state or external safe release notes.

Latest documentation refresh: this board is already filled into the required `.ai` and operator documents. Choose the next task from the package status snapshot below, not from chat history. Public/staging evidence remains pending until the candidate is pushed, staging deploy succeeds, and `/api/release` matches `git rev-parse HEAD`; until then, work only on local implementation or documentation that reduces the first open P5 blocker.

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

- The portfolio testability contract is the completion rule for this gate: a documented patient, staff, map, OTP, queue, notification/outbox, refresh/revisit, membership, audit-log, backup, rollback, or evidence path is not complete until a visitor or invited tester can use it in the deployed environment without developer explanation, direct database edits, placeholder-only accounts, or raw implementation errors.
- P5-A remains open until a real OTP-receivable staff/admin and tester path is proven without direct database edits. Signing in with an unrostered personal email should fail authorization; the fix is to roster that exact tester email through bootstrap or membership management.
- P5-B remains open until the public map is proven as an interactive provider-backed experience. Seeded QDoc clinics are the check-in source of truth, but they are not enough for nearby healthcare discovery by themselves.
- P5-C remains open until first-time staging OTP delivery, readable delivery/rate-limit/invalid/expired states, and refresh/revisit session behavior are proven against the deployed environment.
- P5-D remains open until the patient and staff demo paths can be exercised from the UI and checklist alone, including queue operations, notification/outbox behavior, membership management, and audit-log review.
- P5-E remains open until staging verifier, rehearsal, backup restore-check, rollback target, and safe GO/NO-GO evidence are recorded.

Do not downgrade one of these requirements to an accepted risk unless the user explicitly decides that the behavior is outside the public portfolio demo.

Treat tester-facing usability gaps as implementation work. A map that renders but does not pan, zoom, recenter, or synchronize selection; staff access that only works after hidden database edits; OTP failures that expose raw API codes; or smoke steps that require developer explanation are blockers in their related P5 package.

Future roadmap items remain excluded from this contract unless explicitly approved. Do not use that exclusion to defer one of the documented portfolio-demo flows.

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

## Portfolio Tester Completion Matrix

Use this matrix when deciding the next work item or judging whether a package can close. A visible feature is not complete just because it exists in the UI; it must work from a tester's point of view and have the required local plus staging/manual proof.

| Surface | Must be true before GO | Still open when |
| --- | --- | --- |
| Patient auth and session | A first-time visitor can request OTP, sign in, refresh or revisit, and understand retry/failure states. | OTP delivery is unproven in staging, raw auth codes appear, or session behavior is only known locally. |
| Patient map and discovery | Browser geolocation centers the provider-backed map when allowed; pan, zoom, recenter, marker/card sync, selected-state feedback, and QDoc-vs-provider distinction work. | The map is seeded-clinic-only, static/fallback-only, non-interactive, or provider credentials/restrictions/cost controls are unverified. |
| Patient queue flow | A visitor can choose a QDoc clinic/queue, check in, see active status, notification preferences, and status changes after staff actions. | The path needs developer explanation, direct DB edits, or does not survive refresh/revisit. |
| Staff access | A real OTP-receivable admin/staff account and tester membership path are prepared without direct database edits. | Only placeholder accounts exist, an unrostered email is expected to work, or staging inbox proof is missing. |
| Staff operations | An authorized tester can call, start, complete, delay, restore, cancel, open/close queues, manage memberships where admin, and review audit logs. | Buttons are visible but not verified end to end, role boundaries are unclear, or audit/membership paths need hidden setup. |
| Notification and worker | Almost-ready notification creation, outbox processing, failed-job visibility, and duplicate guard are proven on the deployed worker. | Evidence is local only or deployed worker/outbox state is not checked after manual smoke. |
| Operations decision | Staging verifier, rehearsal, backup restore-check, rollback target, safe evidence, and GO/NO-GO are recorded. | Any evidence is missing, private data would need to be pasted into docs, or rollback/backup proof is absent. |

## Work Packages

Completion standard: a work package is not done only because the code path exists. It is done when the intended visitor or tester can execute the documented workflow in staging without developer explanation, direct database edits, placeholder-only accounts, or raw implementation errors. If evidence collection finds a gap, return to implementation in that package and update the status here.

### P5-A Staff Demo Access

Outcome: staging has at least one real OTP-receivable staff/admin account and a tester authorization path that does not require direct database edits.

Implementation state:

- Seed/bootstrap supports expected staff/admin emails.
- Existing staging databases can add or promote real staff/admin emails with `deploy/bootstrap-staff-admins.sh` or `pnpm db:bootstrap-staff-admins:staging` without rerunning the full seed, resetting tickets, changing queues, or changing map guardrail rows.
- Launch/admin-data verification can assert staff/admin readiness without printing addresses.
- Local E2E proves admin-created staff tester membership, staff-only role boundaries, admin role update/delete flows, membership audit-log visibility, and last-admin protection.
- The staff sign-in surface now tells testers before OTP that staff tools require a staff/admin email added to a site roster, while personal emails remain limited to patient check-in until an admin adds them.
- The staff sign-in OTP controls now keep the email, 6-digit code, and submit action in a compact responsive control group, with E2E coverage preventing the staff OTP input from expanding into a full-width row.

Remaining evidence:

- Configure a real staff/admin inbox through `QDOC_SEED_STAFF_ADMIN_EMAILS`, `QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS`, or admin membership management.
- For an already-deployed staging database, run the staff-admin bootstrap first in dry-run mode, then apply it only after confirming the target site count. The deploy helper dry-runs by default unless `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply` is set. Production-like apply requires `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply`. The command output must remain safe and must not print real email addresses.
- Verify the expected staff/admin account with `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS`, then record `QDOC_SMOKE_STAFF_ADMIN_DATA=passed` only when the staging admin-data verifier passed without printing the address.
- Sign in at `/staff` using a real inbox.
- Add or verify a tester membership through the UI, then record `QDOC_SMOKE_STAFF_TESTER_MEMBERSHIP=passed`.
- Verify staff-only role boundaries through the UI, then record `QDOC_SMOKE_STAFF_ROLE_BOUNDARY=passed`.
- Confirm an unrostered personal email is denied staff access with readable copy.

Verification:

- `pnpm verify:admin-data`
- `pnpm verify:launch`
- `QDOC_BOOTSTRAP_STAFF_DRY_RUN=true QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" pnpm db:bootstrap-staff-admins`
- `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" pnpm db:bootstrap-staff-admins:staging`
- `QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" bash deploy/bootstrap-staff-admins.sh` from the deployed release for the default dry-run plan
- `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" bash deploy/bootstrap-staff-admins.sh` from the deployed release when applying approved staging staff/admin access
- staff membership E2E or manual staging smoke
- `QDOC_SMOKE_STAFF_ADMIN_DATA=passed QDOC_SMOKE_STAFF_ADMIN_SIGNIN=passed QDOC_SMOKE_STAFF_TESTER_AUTH=passed QDOC_SMOKE_STAFF_TESTER_MEMBERSHIP=passed QDOC_SMOKE_STAFF_ROLE_BOUNDARY=passed QDOC_SMOKE_UNROSTERED_STAFF_DENIAL=passed bash deploy/portfolio-smoke-evidence.sh` as part of the P5-A smoke rollup after staging verification
- safe release evidence that does not disclose real email addresses unless explicitly approved

### P5-B Provider Map Public-Browser Verification

Outcome: the public patient map behaves like an interactive provider-backed map when enabled and fails closed when provider access, usage budget, credentials, or browser permission are unavailable.

Implementation state:

- Local provider map interaction is implemented.
- Marker/card synchronization, accessible selected-state feedback, current-location recentering, Refresh-triggered provider retry, failed provider SDK load recovery, and hidden internal guardrail copy are covered locally.
- Staff map-budget availability status renders human-readable labels instead of raw provider availability enum values.
- Disabled-provider fallback now supports visible marker selection, app-level pan controls, zoom controls, current-location recentering, and patient-readable copy so the fail-closed state is still usable during local or guarded verification.
- Local E2E uses a stubbed provider SDK/cache path, including a first-load script failure retry case and app-level provider pan proof, to avoid paid provider traffic.
- Latest P5-B implementation update: observable local pan proof now exists for both the provider-backed map path and the disabled-provider fallback path. This closes the local render/zoom/recenter-only gap, but P5-B still remains open for `GO` until staging proves public-browser provider behavior, provider restrictions, and cost controls.
- Public release preflight is available through `pnpm verify:public-release`. It is read-only, checks only `/api/health` and `/api/release`, and should run before `pnpm e2e:portfolio` when public evidence must prove the deployed URL is serving the expected candidate SHA.
- Public browser Playwright smoke is available through `pnpm e2e:portfolio`. It is read-only, requires `QDOC_PUBLIC_URL` or `QDOC_PORTFOLIO_BASE_URL`, and can fail early on stale public deployments with `QDOC_PORTFOLIO_EXPECT_RELEASE_SHA=<40-character-git-sha>` by comparing the safe `/api/release` identity endpoint. It can require provider-backed map behavior with `QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true`. Strict provider mode now fails unless browser geolocation is available, the provider map reaches ready state, at least one QDoc clinic marker is present, at least one provider nearby discovery place is rendered, and the app-level pan, zoom, and current-location recenter controls call the live provider map. The smoke also asserts patient OTP-entry surface visibility, clinic-card/marker selected-state feedback, and fallback pan/zoom/recenter viewport changes so a map that renders but does not respond to interaction remains a blocker.

Remaining evidence:

- Configure provider-side restrictions, quotas, and billing alerts.
- Configure QDoc monthly hard stops for `map_load` and `places_search`.
- Verify public browser credentials and server-side search credentials where used.
- Confirm geolocation-centered loading, pan or native drag, zoom, recentering, marker/card sync, QDoc-vs-provider visual distinction, denied-location fallback, and over-budget fallback in staging.

Verification:

- targeted/full Playwright E2E locally
- fallback map E2E for disabled-provider pan or drag surrogate, zoom, recenter, and selection behavior
- `QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_EXPECTED_RELEASE_SHA=<git-sha> pnpm verify:public-release`
- `QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_PORTFOLIO_EXPECT_RELEASE_SHA=<git-sha> QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true pnpm e2e:portfolio`
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
- OTP request/verify rate limits are environment-configurable with conservative defaults matching the original policy. SMTP delivery failures now clear the normal request cooldown and enter a short delivery-unavailable backoff with retry timing, so repeated provider failures do not hammer email delivery and first-time visitors are not shown a misleading `rate_limited` response immediately after a failed delivery attempt.

Remaining evidence:

- Verify first-time OTP delivery with staging SMTP settings.
- Confirm the deployed OTP limit variables are positive with `pnpm verify:launch`; relax them only temporarily for approved staging smoke if needed.
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

- Local automated coverage includes notification preference persistence, almost-ready notification/outbox creation, failed-job visibility, cancel flow, audit-log refresh, duplicate almost-ready prevention, core queue operations, membership role update/delete, membership audit-log visibility, and last-admin protection.
- Read-only public release preflight catches healthy-but-stale public deployments before browser smoke, so P5-D evidence is not collected against an old artifact.
- Read-only public browser smoke covers patient page load, patient OTP-entry surface visibility, Refresh usability, clinic selection, marker selection, selected-state feedback, map fallback/provider surface expectations, `/staff` sign-in surface plus roster-guidance and initial auth-control reachability, and absence of raw internal API/error tokens in the public UI, including auth, queue, map-provider, and provider-availability codes. It does not request OTPs or prove staff authorization.
- `deploy/portfolio-smoke-evidence.sh` and `pnpm verify:portfolio-smoke` provide a read-only helper for converting P5-A through P5-D manual smoke outcomes into safe package status exports for `deploy/release-evidence.sh`. The helper requires explicit public release preflight and public browser smoke statuses before P5-B or P5-D can pass. It also requires separate statuses for tester membership, role boundaries, patient refresh/revisit, queue controls/notification threshold, membership management, audit-log review, notification/outbox behavior, and duplicate-delivery prevention so the GO evidence cannot hide a skipped workflow inside a coarse package status.

Remaining evidence:

- Patient smoke: OTP sign-in, geolocation-centered discovery, clinic/queue selection, check-in, active ticket state, refresh/revisit continuity with `QDOC_SMOKE_PATIENT_STATUS_REVISIT=passed`, notification preferences, and readable fallback states.
- Staff smoke: OTP sign-in, authorized site selection, call/start/complete, delay/restore, cancel, queue open/close and notification threshold with `QDOC_SMOKE_STAFF_QUEUE_CONTROLS=passed`, membership management with `QDOC_SMOKE_MEMBERSHIP_AUDIT=passed`, audit-log review with `QDOC_SMOKE_AUDIT_LOG_REVIEW=passed`, and role boundary checks.
- Worker smoke: almost-ready notification generation, outbox processing, failed-job visibility, and duplicate-delivery prevention on the deployed worker.

Verification:

- `pnpm e2e`
- `QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_EXPECTED_RELEASE_SHA=<git-sha> pnpm verify:public-release`
- `QDOC_PUBLIC_URL=https://qdoc.example.com pnpm e2e:portfolio`
- `QDOC_SMOKE_PUBLIC_RELEASE_PREFLIGHT=passed QDOC_SMOKE_PUBLIC_BROWSER_SMOKE=passed pnpm verify:portfolio-smoke` after the deployed candidate passes public release preflight and public browser smoke
- staging manual patient/staff smoke
- `pnpm verify:outbox`
- `pnpm verify:ops`

### P5-E Operations Evidence And Decision

Outcome: staging verification, full rehearsal, backup restore-check, rollback target, safe evidence, and explicit GO/NO-GO decision are recorded.

Implementation state:

- `docs/release-go-no-go.md` contains the release checklist.
- `deploy/release-evidence.sh` and `pnpm verify:release-evidence` provide a read-only evidence preflight and redacted decision-record block after blocking validation passes. A `GO` decision is rejected unless every P5 package status and required evidence status is `passed`.
- `deploy/release-evidence.self-test.sh` and `pnpm verify:release-evidence:self-test` cover the release evidence decision guard locally without AWS, Docker, SMTP, map provider, public URL, or database access. The self-test proves that `GO` with pending statuses fails without printing a decision block, `NO-GO` with pending statuses remains recordable with warnings, and `GO` with every required status passed prints only redacted private operational identifiers.
- `deploy/portfolio-smoke-evidence.sh` and `pnpm verify:portfolio-smoke` provide the manual P5-A through P5-D smoke status rollup that feeds the release evidence preflight.
- `deploy/portfolio-smoke-evidence.self-test.sh` and `pnpm verify:portfolio-smoke:self-test` cover the smoke rollup locally without AWS, Docker, SMTP, map provider, public URL, or database access. The self-test proves that pending evidence remains pending, strict mode blocks skipped checks, older coarse P5-A status sets cannot pass, invalid values fail, and fully passed P5-A through P5-D inputs produce passed release-evidence exports.
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
- `pnpm verify:portfolio-smoke:self-test`
- `pnpm verify:public-release`
- `deploy/verify-staging.sh`
- `deploy/staging-rehearsal.sh`
- backup restore-check command
- `pnpm verify:release-evidence`
- `pnpm verify:release-evidence:self-test`
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
