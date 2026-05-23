# Project: QDoc

This repository is the source of truth for QDoc implementation, deployment automation, and agentic execution state.

## Repository

- Repository path: `.`
- External planning source used to initialize this workflow: `../../codex/QDoc`
- Workflow template source used to initialize this workflow: `../workflow`
- Product docs: `.ai/core/PRD.md`, `.ai/core/ARCHITECTURE.md`, `.ai/core/ADR.md`
- Phase registry: `.ai/phases/index.json`
- Phase plans: `.ai/phases/{task}/*`
- Current task, if present: `.ai/execution/current.md`
- Portfolio GO work-package handoff: `docs/portfolio-go-work-packages.md`
- Local workflow mirror for portfolio GO handoff: `.ai/docs/portfolio-go-work-packages.md`

## Stack

- Application: TypeScript monorepo managed with pnpm workspace and Turborepo.
- Frontend: Next.js App Router, React, Tailwind CSS, shadcn-style UI primitives, lucide-react.
- Backend: Node HTTP API using shared Zod contracts; QDoc plan allows NestJS-style module boundaries where useful.
- Worker: Node/TypeScript worker that processes database-backed outbox jobs.
- Data: PostgreSQL, Prisma schema/migrations/seed, Redis for OTP abuse-control counters and future coordination.
- Hosting: Small EC2 instance behind host-level Caddy; Docker Compose runs web, api, worker, PostgreSQL, and Redis.
- Automation: GitHub Actions builds artifacts, uploads to S3, and deploys through AWS Systems Manager Run Command.
- Observability: Health endpoints, service/container logs, deployment command output, and future queue/notification metrics.

## Critical Architecture Rules

- Use `.` as the working directory for future Codex work on implementation.
- Do not update `../../codex/QDoc` or `../workflow` unless the user explicitly asks for those repositories to change.
- Do not change selected architecture, public URLs, public API contracts, data schemas, deployment flow, or secret handling without explicit approval.
- Keep frontend, API, worker, database, contracts, UI, and config responsibilities separated by the existing monorepo boundaries.
- Never commit tokens, deploy hooks, API keys, credentials, OTP values from real environments, SMTP secrets, AWS keys, or other secrets.
- Public endpoints must stay limited to documented API paths and must validate external input.
- Preserve backward compatibility unless the user explicitly approves a breaking change.
- Update `.ai/core` docs and `.ai/phases` plans before changing public APIs, deployment flow, secret handling, or data storage structure.
- Record newly approved portfolio-readiness blockers in `.ai/execution/current.md` and the active `.ai/phases/{task}/step*.md` before implementation, so future work does not depend on chat history.
- Record newly approved P5-A through P5-E portfolio work-package changes in committed `docs/portfolio-go-work-packages.md` as the canonical handoff, mirror them in `.ai/docs/portfolio-go-work-packages.md`, then sync `.ai/execution/current.md` and the active Step 5 file.
- EC2 deployment must keep build work off the low-resource host; GitHub Actions should produce the deployable artifact.

## Portfolio Public Demo Gate

- Treat `GO` as permission to present QDoc as a public portfolio demo, not merely as a minimal staging deployment.
- `Launch` in the current task means portfolio-ready public demo. It does not mean every future roadmap item is complete, but every documented core patient, staff, map, OTP, queue, notification, and operational smoke path must be implemented, testable, and understandable without developer explanation.
- Do not treat a successful build, deploy, or staging health check as sufficient for `GO`. The user-facing patient/staff workflows and operational recovery evidence are part of the gate.
- Newly defined Step 5 work is product-completion work plus evidence collection. Do not treat P5-A through P5-E as optional roadmap, documentation-only work, or deployment-only validation.
- Treat the portfolio site as a user-testable product surface for the documented QDoc flows. Before `GO`, the currently documented patient, staff, map, OTP, queue, notification/outbox, refresh/revisit, membership, audit-log, backup, rollback, and staging verification paths must work well enough for normal tester use; do not rely on "MVP only" reasoning to defer one of those documented paths.
- Before `GO`, a visitor must be able to complete the patient flow without external explanation: location/map discovery, OTP sign-in, clinic/queue selection, check-in, refresh/session continuity, and active ticket status.
- Before `GO`, an authorized staff tester must be able to complete staff operations: OTP sign-in, site selection, queue board review, call/start/complete, delay/restore, cancel, queue open/close, notification threshold, membership management, and audit-log review.
- Before `GO`, the map must behave like an interactive map when a provider is enabled: browser-geolocation centering, pan/zoom controls, current-location recentering, marker click selection, selected marker/site highlighting, and clear distinction between QDoc check-in sites and provider discovery places.
- The patient map must not treat database seed clinics as the only nearby healthcare truth. Browser geolocation and the active provider should supply the public discovery context; QDoc database sites remain authoritative for check-in, queue, staff, and notification behavior.
- A static or decorative fallback map is acceptable only as a fail-closed disabled-provider state; it is not sufficient as the final portfolio map experience.
- Before `GO`, OTP delivery and user-facing errors must be understandable to a non-technical visitor. Do not expose raw internal error codes such as `rate_limited`, `otp_delivery_unavailable`, `invalid_otp`, `expired_otp`, or map cost-guardrail implementation details directly in the UI.
- Before `GO`, staging must have real OTP-receivable staff/admin accounts prepared through documented bootstrap or membership workflows.
- An unrostered personal email must not gain staff access. If a tester needs staff access, preparing that exact email through seed bootstrap or admin membership management is part of the active work, not an assumed manual database edit.
- A fallback/static map is only acceptable as the disabled-provider or fail-closed path. Do not treat it as the final portfolio map experience while provider-backed public-browser interaction remains unverified.
- The active implementation order for the current launch-candidate step is: staff demo access, provider-backed map/public-browser verification, first-time OTP delivery verification, full patient/staff smoke, notification/outbox evidence, backup restore-check, rollback target, then GO/NO-GO record.
- Use the current Step 5 work packages as commit and evidence boundaries: P5-A staff demo access, P5-B provider map public-browser verification, P5-C OTP delivery and auth error usability, P5-D public demo smoke, and P5-E operations evidence and decision.
- P5-A is not complete until a real OTP-receivable staff/admin and tester path is proven without direct database edits. P5-B is not complete while the public map is seeded-clinic-only or non-interactive. P5-C is not complete while first-time staging OTP delivery or readable auth failures are unproven. P5-D is not complete while patient/staff smoke requires developer explanation. P5-E is not complete while staging verifier, rehearsal, backup restore-check, rollback target, or decision evidence are missing.
- Distinguish local implementation completion from staging/manual evidence. A blocker is not closed for `GO` until the required staging/manual proof exists for behavior that depends on real email delivery, real provider credentials, public browser restrictions, deployed host config, backup restore-checks, or rollback artifacts.
- When the user asks for the next Step 5 task, choose the first package in P5-A through P5-E order whose staging/manual proof is still missing, unless the latest user instruction identifies a more urgent blocker.
- If staging/manual proof exposes a product gap, return to implementation inside that same P5 package. Do not move the gap to release notes or mark it accepted risk unless the user explicitly approves excluding it from the public portfolio demo.
- Keep each P5 package status in three separate buckets: local implementation/automated coverage, staging/manual evidence, and release decision status. Do not collapse those into a single "done" state.
- When a tester-facing path is missing, confusing, non-interactive, placeholder-only, or dependent on developer/operator explanation, treat that as active implementation work in the relevant P5 package before collecting final evidence.
- Use `deploy/release-evidence.sh` or `pnpm verify:release-evidence` as the read-only P5-E evidence preflight before copying identifiers into `docs/release-go-no-go.md`; strict final evidence should use `QDOC_EVIDENCE_STRICT=true`, and public/repository evidence should keep the default redacted output.
- Use `deploy/portfolio-smoke-evidence.sh` or `pnpm verify:portfolio-smoke` after staging manual smoke to roll P5-A through P5-D outcomes into package status exports for the release evidence preflight; strict final smoke evidence should use `QDOC_SMOKE_STRICT=true`.
- Use `pnpm verify:email` locally and `QDOC_VERIFY_EMAIL=true bash deploy/verify-staging.sh` in staging for P5-C email readiness. Add `QDOC_VERIFY_SMTP_CONNECTIVITY=true` only when an approved live SMTP connectivity/auth check is intended. This verifier must remain safe: no SMTP secrets, provider diagnostics, OTP values, recipient addresses, or real email sends in output.
- When resuming Step 5, read the work package status snapshot in `.ai/execution/current.md` and `.ai/phases/qdoc-launch-candidate/step5.md` before choosing the next task. Choose work from P5-A through P5-E based on the latest blocker, and treat staging/manual product gaps as implementation work in the relevant package before returning to evidence collection.
- Also read `docs/portfolio-go-work-packages.md` and its local `.ai/docs/portfolio-go-work-packages.md` mirror when resuming Step 5. The committed docs file is the package-level source of truth for the newly defined P5-A staff demo access, P5-B provider map public-browser verification, P5-C OTP delivery and auth error usability, P5-D public demo smoke, and P5-E operations evidence and decision work.
- Current GO blockers must stay synchronized in `.ai/execution/current.md` and `.ai/phases/qdoc-launch-candidate/step5.md`. Update `.ai/core/PRD.md`, `.ai/core/ARCHITECTURE.md`, `.ai/core/ADR.md`, `AGENTS.md`, README, or `docs/release-go-no-go.md` when the change affects product scope, architecture, durable decisions, future-agent rules, or tester/operator procedures.
- Future changes that redefine `GO`, public demo scope, map provider behavior, staff bootstrap, session/auth behavior, deployment flow, or secret handling must be reflected in `.ai/core`, the active `.ai/phases` step, and this file before implementation continues.

## Work Process

Before non-trivial implementation:

1. Read `.ai/core/PRD.md`.
2. Read `.ai/core/ARCHITECTURE.md`.
3. Read `.ai/core/ADR.md`.
4. Check `.ai/execution/current.md` if it exists.
5. Otherwise, follow `.ai/phases/index.json`, the relevant task index, and the relevant phase document.

Current task priority:

1. User's latest instruction
2. `.ai/execution/current.md`
3. `.ai/phases/index.json`
4. Relevant `.ai/phases/{task}/index.json`
5. Relevant phase document
6. `.ai/core/ADR.md`
7. `.ai/core/ARCHITECTURE.md`
8. `.ai/core/PRD.md`

Do not treat archived or completed phase files as current instructions unless explicitly asked.

## Planning Rules

- Keep implementation and planning changes in this repository.
- Do not expand scope beyond the active phase without approval.
- If a required change conflicts with existing core docs, update the docs first or clearly explain the conflict.
- Each step must be independently executable and include concrete verification criteria.
- Completed steps can be used as context, but new implementation should target the active step.

## Commit Unit Rules

- When a step, phase, or task implementation and verification are complete, check `git status`, changed file names, and the relevant diff scope before moving to the next step.
- Treat this commit-unit check as change-scope classification, not as a full pre-commit security review.
- If the current changes form a coherent commit unit, propose the commit to the user before starting the next step. Do not commit unless explicitly requested.
- Before running an actual `git commit`, perform the `precommit-security-review` security and operations review.
- Do not leave previous step/task changes in the worktree and mix them with the next step. If one file contains changes from multiple steps/tasks, tell the user that hunk-level staging or split commits are needed.

## Security Rules

- Never print, log, commit, or expose secrets.
- Do not place secrets in generated static files, client bundles, public JSON, logs, examples, screenshots, or workflow output.
- Do not expose API, PostgreSQL, Redis, or internal container ports publicly on EC2.
- Keep Caddy as the public ingress boundary for staging/production unless an approved architecture change replaces it.
- Public API routes must define method, path, input, output, auth, and abuse-prevention assumptions.
- Infrastructure and repository settings require manual configuration in the operating account.

## Verification

Workflow structure:

```bash
python3 .ai/scripts/validate_workflow.py
python3 .ai/scripts/execute.py qdoc-launch-candidate --check
```

Repository hygiene:

```bash
git diff --check
```

Project checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm db:validate
pnpm verify:outbox
pnpm verify:ops
pnpm verify:admin-data
pnpm verify:launch
pnpm verify:email
```

## Notes

- Keep this file focused on stable project rules.
- Keep temporary or current implementation details in `.ai/execution/current.md`.
- Keep durable project context in `.ai/core`.
- Keep detailed phase sequencing in `.ai/phases/{task}/index.json`.
