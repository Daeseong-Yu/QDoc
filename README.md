# QDoc

QDoc is a hackathon project for clinic check-in and queue operations. It helps walk-in patients check in before they arrive, track their ticket status, and receive a notification when their turn is close. It also gives clinic staff a lightweight queue board for calling patients, moving them into service, delaying late arrivals, restoring them to the front of the waiting queue, and completing or cancelling tickets.

## Project Description

### Problem

Walk-in clinic queues are often managed through front-desk conversations, phone calls, paper lists, or disconnected tools. Patients do not know whether one clinic has a much shorter line than another, and they can miss their turn if they leave the waiting area without a reliable status update. Staff also need a practical way to handle late patients without losing the original queue order or creating confusion for everyone still waiting.

### Solution

QDoc turns the clinic queue into a simple web workflow:

- Patients choose a clinic location, see current waiting counts and distance hints, sign in with email OTP, and check in to a queue.
- Patients can return to the app to see their active ticket, status changes, and in-app notifications.
- Staff sign in with the same OTP flow and use a site-scoped queue board to call, start service, complete, delay, restore, or cancel tickets.
- Status changes are recorded as ticket events, audit logs, notification logs, and outbox jobs so operational history and notification delivery are not tied only to the UI request.

### How It Was Built

QDoc is implemented as a production-shaped TypeScript monorepo:

- `apps/web`: Next.js App Router frontend for patient check-in and staff queue management.
- `apps/api`: Node HTTP API for OTP auth, sessions, patient check-in, active tickets, staff authorization, and ticket state transitions.
- `apps/worker`: background worker that polls the database outbox, claims pending jobs, sends almost-ready emails, and retries failed work.
- `packages/contracts`: shared Zod schemas and TypeScript types used by both web and API code.
- `packages/db`: Prisma schema, migrations, seed data, and Prisma client access.
- `packages/config`, `packages/ui`: shared TypeScript config and UI package scaffolding.

### Architecture

![QDoc Infrastructure](./docs/assets/infrastructure.svg)

QDoc is deployed on a small EC2 instance behind host-level Caddy. GitHub Actions builds the application image, uploads the compressed image artifact to S3, and triggers Systems Manager Run Command so the host only downloads and runs the image. The Docker Compose stack runs the Next.js web app, Node API server, PostgreSQL, Redis, migration/seed jobs, and a background worker; only the web app is published to the host loopback interface for Caddy to proxy. The waiting queue is backed by ticket rows in PostgreSQL, while notification jobs use a database-backed outbox that the worker polls and processes. Redis is used for OTP abuse-control counters and remains available for future realtime, cache, or coordination work.

The core database model includes organizations, clinic sites, queues, users, staff memberships, OTP challenges, tickets, ticket events, notification logs, outbox rows, and audit logs. Ticket ordering uses a `sortRank` field instead of only `createdAt`, which lets a delayed patient be restored to the front of the waiting queue in a controlled way.

### Challenges

- Keeping the scope small enough for a hackathon while still building an end-to-end vertical slice with separate web, API, worker, database, contracts, and deployment structure.
- Making ticket transitions safe so staff actions cannot move a ticket from an invalid state, such as completing a ticket that was never started.
- Supporting late-arrival handling without breaking queue fairness. The `delay` and `restore` flow required explicit ordering logic and DB indexes.
- Decoupling notification work from staff API requests. The outbox pattern keeps status changes durable even if email delivery fails and needs retry.
- Protecting patient privacy on the staff board by masking patient emails while still giving staff enough context to operate the queue.

### What's Next

- Complete the portfolio-ready map experience: provider-backed pan/zoom, current-location recentering, marker selection, selected site highlighting, and clear distinction between QDoc check-in sites and third-party discovery places.
- Finalize public demo readiness: real OTP-receivable staff accounts, user-friendly OTP/map errors, staging smoke evidence, backup restore-check evidence, and rollback readiness.
- Add real distance and travel-time estimates instead of seeded distance values.
- Add SMS/push notifications and more configurable notification thresholds.
- Replace polling with SSE for faster live queue updates.
- Add richer staff roles, queue closing controls, and multi-department clinic support.
- Expand Playwright coverage for edge cases such as closed queues, duplicate check-ins, and cancelled tickets.
- Add observability dashboards for queue wait times, notification failures, and staff actions.
- Integrate with clinic EMR/EHR systems after the core queue workflow is stable.

## Tech Stack

- TypeScript, pnpm workspace, Turborepo
- Next.js 15, React 19, Tailwind CSS, lucide-react
- Node HTTP API with shared Zod contracts
- PostgreSQL, Prisma, Prisma migrations and seed data
- Database-backed outbox worker with SMTP or local console email delivery
- Docker Compose for local PostgreSQL and Redis
- Docker Compose staging deployment behind host Caddy
- GitHub Actions, S3, and AWS Systems Manager for external image build and low-resource host deployment

## Core Flows

Patient flow:

1. Open the patient app.
2. Select a clinic and queue.
3. Sign in with email OTP.
4. Check in.
5. Watch the active ticket panel update by polling.
6. Receive in-app and email notifications when the ticket is close to being called.

Staff flow:

1. Open `/staff`.
2. Sign in with a prepared staff/admin account. Local development may use the seeded `staff@example.com`; staging and portfolio smoke must use a real OTP-receivable email prepared by seed, staff-admin bootstrap, or membership management.
3. Select a staffed site.
4. Move tickets through call, start service, complete, delay, restore, or cancel actions.
5. Each ticket state change writes `ticket_event`, `audit_log`, `notification_log`, and `outbox` records.

Worker flow:

1. Staff ticket actions create pending outbox rows.
2. `apps/worker` claims pending or stale processing rows.
3. The worker marks rows as `processed`, retries failed rows with backoff, or marks them `failed` after max attempts.

OTP abuse controls:

1. OTP request and verification attempts keep the existing in-process cooldowns.
2. When `REDIS_URL` is configured, API adds Redis TTL counters for email, client IP, and client IP plus email combinations.
3. Redis keys use hashed identifiers instead of raw email addresses.

Portfolio public demo gate:

1. `GO` means the site is ready for portfolio visitors, not only deployable to staging.
2. Patient OTP, clinic discovery, map interaction, check-in, active ticket status, and refresh/session continuity must work without developer explanation.
3. Staff testing requires a real OTP-receivable staff/admin account prepared by bootstrap or membership management.
4. User-facing UI must not expose raw internal error codes, OTP values, provider secrets, or implementation-only map cost labels.

Current pre-GO work packages:

1. P5-A Staff demo access: prepare real OTP-receivable staff/admin and tester access, verify role boundaries, and keep unrostered emails denied with readable copy.
2. P5-B Provider map public-browser verification: prove geolocation-centered provider discovery, pan/zoom, recentering, marker/card synchronization, QDoc-vs-provider distinction, and fail-closed cost controls.
3. P5-C OTP delivery and auth error usability: prove first-time staging OTP delivery and readable delivery-unavailable, rate-limited, invalid-code, expired-code, and unauthorized-staff states.
4. P5-D Public demo smoke: exercise patient, staff, queue, notification/outbox, refresh/revisit, membership, audit-log, and map paths as a visitor or invited tester would use them.
5. P5-E Operations evidence and decision: record staging verifier, rehearsal, backup restore-check, rollback target, safe evidence identifiers, known risks, and an explicit GO/NO-GO decision.

The package handoff is tracked in [docs/portfolio-go-work-packages.md](docs/portfolio-go-work-packages.md). Tester-facing smoke steps are in [docs/portfolio-tester-guide.md](docs/portfolio-tester-guide.md), while operator release evidence is tracked in [docs/release-go-no-go.md](docs/release-go-no-go.md). The active workflow state is mirrored under `.ai/`, and future Codex sessions should use `AGENTS.md` plus the active Step 5 files before choosing the next task.

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
```

The compose file binds PostgreSQL and Redis to localhost only. Default ports from `.env.example` are:

- PostgreSQL: `127.0.0.1:55432`
- Redis: `127.0.0.1:56379`
- API: `127.0.0.1:4000`

If local development data can be discarded, reset and replay all migrations with:

```bash
pnpm exec dotenv -e .env -- pnpm --filter @qdoc/db exec prisma migrate reset --schema prisma/schema.prisma --force --skip-seed
pnpm db:seed
```

## Running Locally

Run individual processes in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

Useful URLs:

- Patient app: `http://localhost:3000`
- Staff queue board: `http://localhost:3000/staff`
- API health: `http://127.0.0.1:4000/health`

If port `3000` is already in use, Next.js will choose another local port and print it in the terminal.

OTP delivery is console-based in local development. When signing in, read the verification code from the API server logs.

Seed data:

- Staff account: local defaults to `staff@example.com`. For staging, set `QDOC_SEED_STAFF_ADMIN_EMAILS` to one or more real OTP-receivable staff emails before running seed/deploy; staging seed fails closed when this is missing or uses example-domain addresses.
- Existing staging staff bootstrap: use `deploy/bootstrap-staff-admins.sh` with `QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS` to add or promote real staff/admin emails without resetting demo tickets. The deploy helper dry-runs by default; production-like apply requires `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply`. `pnpm verify:staff-bootstrap` checks both the DB-free bootstrap policy and the deployed wrapper defaults without contacting Docker or the database.
- Waterloo Clinic: `site-waterloo`, `queue-waterloo-walkin`, 19 waiting tickets
- Kitchener Clinic: `site-kitchener`, `queue-kitchener-walkin`, 5 waiting tickets
- Dental Clinic: `site-university`, `queue-university-walkin`, 0 waiting tickets

## Verification

Run the standard checks:

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
pnpm verify:portfolio-smoke:self-test
pnpm verify:release-evidence:self-test
pnpm portfolio:evidence-commands:self-test
pnpm e2e
```

`pnpm verify:outbox` creates scoped verification rows, runs the worker outbox processor against those rows only, checks processed/retry/failed transitions, and removes the rows it created.

`pnpm verify:ops` prints safe operational JSON for outbox status counts, oldest pending job age, failed almost-ready email jobs, active ticket counts, and current map guardrail state. It exits non-zero when failed outbox jobs, stale processing jobs, failed email jobs, or enabled map guardrail misconfiguration need operator attention.

`pnpm verify:admin-data` prints safe operational JSON for organization, clinic site, queue, staff membership, audit-log count, ticket-count, and map budget configuration readiness. It does not print emails, OTPs, raw database URLs, ticket IDs, audit metadata, or patient payloads. Set `QDOC_ADMIN_DATA_EXPECT_SITE_IDS=site-waterloo,site-kitchener,site-university` to require specific launch clinic IDs and their map-ready address and coordinate data, and set `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS` to a real OTP-receivable staff/admin inbox to verify that each launch site has the expected admin memberships without printing the addresses. Missing expected data exits non-zero and provides a failure-path check without changing database rows.

`pnpm verify:launch` prints safe launch-readiness JSON for required database and Redis configuration, session hardening, HTTPS origin settings, loopback web binding, OTP debug flags, configurable OTP abuse limits, SMTP readiness, and map-provider cost guardrails. It treats `APP_ENV=staging`, `APP_ENV=production`, and `NODE_ENV=production` as launch-like environments and exits non-zero when fail-closed settings are not ready. Nearby healthcare search is disabled by default until a server-side provider credential and a positive monthly search limit are configured.

`pnpm verify:email` prints safe email-delivery readiness JSON for OTP and worker delivery gates. It distinguishes API OTP delivery policy, worker provider policy, SMTP config shape, placeholder SMTP values, and optional SMTP transport connectivity without sending an email or printing SMTP host, username, password, sender, provider diagnostics, OTP values, or recipient addresses. Set `QDOC_VERIFY_SMTP_CONNECTIVITY=true` only when the environment is allowed to make a live SMTP `verify()` connection; this checks connectivity/authentication but still does not prove inbox receipt, so P5-C staging smoke must include a real first-time OTP request.

`pnpm verify:portfolio-smoke` rolls manually observed P5-A through P5-D staging smoke outcomes into safe release-evidence status exports. For P5-A, set `QDOC_SMOKE_STAFF_ADMIN_DATA=passed` only after `pnpm verify:admin-data` or `QDOC_VERIFY_ADMIN_DATA=true bash deploy/verify-staging.sh` passes with `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS` configured for the real staff/admin inbox. The helper does not print the email address and does not contact staging by itself.

`pnpm verify:portfolio-smoke:self-test` exercises the smoke rollup with fake public URLs and status values only. It proves that pending evidence remains pending, strict mode blocks skipped checks, older coarse P5-A status sets cannot pass, invalid status values fail, and fully passed P5-A through P5-D inputs produce passed release-evidence exports without revealing the public URL by default.

`pnpm verify:release-evidence:self-test` exercises the release evidence guard with fake identifiers only. It proves that a `GO` decision cannot be generated with pending P5 or evidence statuses, that a `NO-GO` record can still be produced with warnings, and that private S3 bucket names and backup paths stay redacted in the generated block.

`pnpm portfolio:evidence-commands:self-test` exercises the evidence command-plan helper with fake identifiers only. It proves candidate SHA/image rendering, default and custom launch site IDs, staff email placeholder safety, and provider-map expectation propagation without contacting staging, AWS, Docker, SMTP, map providers, the public URL, or the database.

`pnpm verify:public-release` checks a deployed public URL before browser smoke by calling only `/api/health` and `/api/release`. Set `QDOC_PUBLIC_URL=https://qdoc.example.com` and `QDOC_EXPECTED_RELEASE_SHA=<40-character-git-sha>` to fail early when staging is healthy but still serving an old artifact. This is read-only, redacts the public URL by default, and does not call AWS, Docker, SMTP, map providers, or OTP endpoints.

`pnpm e2e:portfolio` runs a read-only Playwright smoke test against a deployed public URL. Set `QDOC_PUBLIC_URL=https://qdoc.example.com` or `QDOC_PORTFOLIO_BASE_URL=https://qdoc.example.com` before running it. Add `QDOC_PORTFOLIO_EXPECT_RELEASE_SHA=<40-character-git-sha>` to fail early when the public URL is serving a stale candidate; the smoke compares that value with the safe public `/api/release` identity endpoint. When the provider map is expected to be live, add `QDOC_PORTFOLIO_EXPECT_PROVIDER_MAP=true`; the test then requires granted browser geolocation, a ready provider-backed map surface, no fallback map, at least one clickable QDoc clinic marker, at least one clickable provider discovery marker, a direct drag gesture on the ready provider map surface, geolocation recentering, pan/zoom/recenter controls, Refresh/site-selection controls, QDoc marker-to-card synchronization, provider marker selection, clinic reselection recovery, and no raw internal error tokens in the public UI. The same smoke also checks that `/staff` loads the staff sign-in surface without exposing raw internal auth/map errors, but it does not request an OTP or prove staff authorization. Optional `QDOC_PORTFOLIO_GEO_LATITUDE` and `QDOC_PORTFOLIO_GEO_LONGITUDE` override the default Waterloo-area browser geolocation used by the test.

Install the Playwright Chromium browser once before running E2E tests locally:

```bash
pnpm e2e:install
```

`pnpm e2e` starts the API and web dev servers with a test-only fixed OTP, resets isolated E2E rows in the local database, and verifies patient OTP login, check-in, active ticket status updates, staff OTP login, call/start/complete, and delay/restore. The fixed OTP is enabled only inside the Playwright `webServer` environment with `APP_ENV=test`, `EMAIL_PROVIDER=console`, and `ALLOW_FIXED_OTP=true`; normal local, staging, and production runs still use the configured environment. E2E refuses to run against a non-local `DATABASE_URL` unless `QDOC_ALLOW_E2E_REMOTE_DB=true` is explicitly set for an isolated test database.

Manual core-flow staging checklist:

1. Patient requests an email OTP, signs in, selects a clinic queue, checks in, and sees an active ticket.
2. Staff signs in at `/staff` with a prepared real OTP-receivable staff/admin account and can see the same site queue. Do not use local seeded placeholder accounts for staging or portfolio evidence.
3. Staff calls the patient ticket, starts service, and completes it; the patient status panel reflects each state change after polling.
4. Staff delays a waiting ticket and restores it; the restored ticket returns to the front of the waiting queue.
5. Worker logs show outbox jobs being processed, or `QDOC_VERIFY_OUTBOX=true bash deploy/verify-staging.sh` passes against staging.

Release go/no-go:

Use [docs/release-go-no-go.md](docs/release-go-no-go.md) as the launch-candidate evidence template. A launch decision needs local check results, staging verifier/rehearsal evidence, backup restore-check evidence, manual smoke results, manual account configuration confirmation, known residual risks, and a rollback target. Do not store secrets, OTPs, database dumps, private deployment logs, patient payloads, or raw connection strings in the evidence.

## AWS EC2 Staging Deployment

The staging setup assumes another host-level Caddy process already owns public ports `80` and `443`. QDoc should not start its own public Caddy container on that host. The EC2 instance is intentionally kept out of the build path: GitHub Actions builds the Docker image, stores it in S3, and asks Systems Manager to run the host-side deployment script.

Host networking:

- DNS: point the staging domain to the EC2 public IPv4 address, preferably an Elastic IP.
- Security group: allow inbound `80` and `443` from the internet, allow inbound `22` only from the operator's public IP if SSH is still needed, and do not expose the web loopback port, API, PostgreSQL, or Redis publicly.
- Host Caddy: add the QDoc virtual host to `/etc/caddy/Caddyfile` and proxy it to the web container loopback port. Either replace the placeholders before saving the file or set matching Caddy environment variables:

```caddy
{$APP_DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:{$QDOC_WEB_PORT}
}
```

- Compose: `compose.staging.yaml` publishes only `web` to `127.0.0.1:${QDOC_WEB_PORT}`. API, PostgreSQL, Redis, worker, migrate, and seed remain on the private Docker network.
- Environment: set `APP_DOMAIN`, `APP_URL`, `QDOC_WEB_BIND=127.0.0.1`, `QDOC_WEB_PORT`, SMTP credentials, `SESSION_SECRET`, `QDOC_DB_SECRET`, and a matching `DATABASE_URL` in `/opt/qdoc/shared/.env.staging`. `QDOC_APP_IMAGE` is required by Compose, but the shared env file may keep the safe placeholder from `.env.staging.example` when deployments and rehearsals pass the candidate image through the command environment.

Staging environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_DOMAIN` | yes | Public hostname served by host Caddy. |
| `APP_URL` | yes | Public origin, for example `https://qdoc.example.com`. |
| `APP_ENV` | yes | Use `staging` for staging. |
| `QDOC_APP_IMAGE` | yes for Compose | Docker image tag loaded from the S3 artifact, normally `qdoc-app:<git-sha>`. `/opt/qdoc/shared/.env.staging` may keep `qdoc-app:replace-with-git-sha`; deploy and rehearsal scripts export the actual candidate image. Raw `docker compose` commands must pass `QDOC_APP_IMAGE=qdoc-app:<git-sha>` or use an env file with the real tag. |
| `QDOC_RELEASE_SHA` | no | Exported by deploy/rehearsal scripts from the 40-character image tag so `/api/release` can prove which candidate the public URL is serving. |
| `QDOC_WEB_BIND` | yes | Must remain `127.0.0.1`; the deploy script rejects public binds. |
| `QDOC_WEB_PORT` | yes | Host loopback port Caddy proxies to, for example `13000`. |
| `DATABASE_URL` | yes | Internal PostgreSQL URL matching the Compose database service. |
| `POSTGRES_DB`, `POSTGRES_USER`, `QDOC_DB_SECRET` | yes | PostgreSQL bootstrap settings. |
| `REDIS_URL` | yes | Internal Redis URL used for OTP rate-limit counters. |
| `OTP_REQUEST_PAIR_LIMIT_PER_MINUTE`, `OTP_REQUEST_EMAIL_LIMIT_PER_HOUR`, `OTP_REQUEST_EMAIL_LIMIT_PER_DAY`, `OTP_REQUEST_IP_LIMIT_PER_MINUTE`, `OTP_REQUEST_IP_LIMIT_PER_HOUR`, `OTP_VERIFY_PAIR_LIMIT_PER_MINUTE`, `OTP_VERIFY_EMAIL_LIMIT_PER_HOUR`, `OTP_VERIFY_IP_LIMIT_PER_HOUR` | no | Optional OTP request/verify abuse limits. Defaults match the conservative built-in policy. Temporarily relax only for approved staging smoke if real SMTP delivery is healthy and restore before public testing. |
| `SESSION_SECRET` | yes | Long random secret; never commit the value. |
| `QDOC_SEED_STAFF_ADMIN_EMAILS` | staging bootstrap | Comma-separated real staff/admin emails to create or upsert during approved seed/bootstrap. Local defaults to `staff@example.com`; staging requires real OTP-receivable addresses and rejects example-domain placeholders. |
| `QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS` | staff bootstrap | Comma-separated real staff/admin emails to add or promote without rerunning the full seed. The bootstrap command does not print addresses. |
| `QDOC_BOOTSTRAP_STAFF_SITE_IDS` | staff bootstrap | Optional comma-separated site IDs for staff bootstrap. Defaults to `QDOC_ADMIN_DATA_EXPECT_SITE_IDS` when set, otherwise all sites. |
| `QDOC_BOOTSTRAP_STAFF_DRY_RUN` | staff bootstrap | Optional `true` or `false`. The deploy helper defaults to `true`, unless `QDOC_BOOTSTRAP_STAFF_CONFIRM=apply` is set; package scripts still honor the explicit value. |
| `QDOC_BOOTSTRAP_STAFF_CONFIRM` | staff bootstrap | Set to `apply` only for the approved non-dry-run staff-admin bootstrap in staging or production-like environments. Dry-run does not require it. |
| `QDOC_ADMIN_DATA_EXPECT_SITE_IDS` | no | Comma-separated clinic site IDs that `pnpm verify:admin-data` must find with address and coordinate data. Defaults are not required locally, but staging should set the launch clinic IDs. |
| `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS` | no | Comma-separated staff/admin emails that `pnpm verify:admin-data` must find as site admins. The verifier prints counts and site IDs only, not the addresses. |
| `EMAIL_PROVIDER` | yes | Use `smtp` for staging unless console delivery is explicitly allowed. |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | yes for SMTP | SMTP sender and credentials; never print or commit secrets. |
| `ALLOW_CONSOLE_OTP`, `ALLOW_FIXED_OTP` | yes | Keep both `false` in normal staging. |
| `WORKER_POLL_INTERVAL_MS`, `WORKER_OUTBOX_BATCH_SIZE`, `WORKER_OUTBOX_MAX_ATTEMPTS` | no | Optional worker tuning values. |
| `MAP_PROVIDER`, `MAP_PROVIDER_ENABLED`, `MAP_MONTHLY_MAP_LOAD_LIMIT`, `MAP_MONTHLY_PLACES_SEARCH_LIMIT` | no | Optional map provider selection and QDoc monthly hard-stop budgets for browser map loads and provider place searches. Leave search limit at `0` until server-side provider credentials, provider restrictions, and launch limits are configured. |
| `MAP_SETTINGS_ADMIN_EMAILS` | no | Comma-separated operator email allowlist for changing global map budget settings from the staff UI. Leave empty unless an operator should manage cost guardrails. |
| `MAPBOX_PUBLIC_TOKEN`, `GOOGLE_MAPS_BROWSER_KEY` | no | Browser credentials returned only when QDoc map guardrails allow loading; restrict them in the provider console. |
| `MAPBOX_SEARCH_TOKEN`, `GOOGLE_PLACES_SERVER_KEY` | no | Server-side nearby healthcare search credentials. Never expose these in browser code; restrict them in the provider console and keep search disabled until monthly limits are set. |
| `MAP_USAGE_RATE_LIMIT_PER_MINUTE`, `MAP_USAGE_RATE_LIMIT_PER_HOUR` | no | Optional per-requester rate limits before map usage reservations are accepted. |
| `MAP_SEARCH_RATE_LIMIT_PER_MINUTE`, `MAP_SEARCH_RATE_LIMIT_PER_HOUR`, `MAP_SEARCH_CACHE_TTL_SECONDS` | no | Optional per-requester rate limits and short cache TTL for provider nearby healthcare searches. |

GitHub staging environment settings:

Create a GitHub Environment named `staging` and define these values there, or define them at repository/organization scope if they are shared. The deploy workflow validates that required values exist before assuming the AWS role and does not print secret values.

| Name | Type | Notes |
| --- | --- | --- |
| `AWS_REGION` | variable | Region for S3 and Systems Manager. |
| `QDOC_SSM_DOCUMENT_NAME` | variable | Optional; defaults to `QDoc-StagingDeploy`. |
| `AWS_DEPLOY_ROLE_ARN` | secret | OIDC role assumed by GitHub Actions. |
| `QDOC_DEPLOY_BUCKET` | secret | Private S3 artifact bucket. |
| `QDOC_STAGING_INSTANCE_ID` | secret | EC2 managed-instance ID used by SSM. |

Apply Caddy changes:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

One-time AWS setup for S3 + Systems Manager deployment:

- Create a private S3 bucket for deployment artifacts. Keep S3 Block Public Access enabled, enable server-side encryption, and add a lifecycle rule that expires old `staging/` artifacts.
- Attach an EC2 instance profile with `AmazonSSMManagedInstanceCore` and scoped `s3:GetObject` permission for the deployment artifact prefix.
- Confirm SSM Agent is running on the instance and the instance appears as a managed node in Systems Manager.
- Install Docker, Docker Compose, Git, gzip, sha256sum, flock, AWS CLI, and Caddy on the EC2 host. Use a Docker Compose version that supports `up --wait`.
- Create a GitHub Actions OIDC IAM role scoped to this repository and branch. Grant it only the permissions required to upload the artifact and send/read the SSM command for the staging instance.
- Register the custom SSM command document from `deploy/ssm/qdoc-staging-deploy.yaml`. The workflow uses `QDoc-StagingDeploy` by default.
- Add GitHub environment secrets `AWS_DEPLOY_ROLE_ARN`, `QDOC_DEPLOY_BUCKET`, and `QDOC_STAGING_INSTANCE_ID`; add environment variables `AWS_REGION` and optionally `QDOC_SSM_DOCUMENT_NAME`.

Create the SSM document once, then update it when `deploy/ssm/qdoc-staging-deploy.yaml` changes:

```bash
aws ssm create-document \
  --name QDoc-StagingDeploy \
  --document-type Command \
  --document-format YAML \
  --content file://deploy/ssm/qdoc-staging-deploy.yaml

aws ssm update-document \
  --name QDoc-StagingDeploy \
  --document-version '$LATEST' \
  --document-format YAML \
  --content file://deploy/ssm/qdoc-staging-deploy.yaml
```

Prepare the host-side deployment directories. The EC2 instance does not need a Git checkout for deployment; GitHub Actions uploads both the app image artifact and an ops bundle containing the deploy scripts and Compose config. Keep staging secrets outside release bundles in a stable shared env file:

```bash
sudo mkdir -p /opt/qdoc/releases /opt/qdoc/shared /opt/qdoc/backups
sudo install -m 600 .env.staging /opt/qdoc/shared/.env.staging
printf '%s\n' '<artifact-bucket>' | sudo tee /opt/qdoc/shared/deploy-bucket >/dev/null
sudo chmod 600 /opt/qdoc/shared/deploy-bucket
```

Deploy manually through SSM if needed:

```bash
aws ssm send-command \
  --document-name QDoc-StagingDeploy \
  --instance-ids <instance-id> \
  --parameters '{"appArtifactUri":["s3://<artifact-bucket>/staging/<git-sha>/qdoc-app.tar.gz"],"opsBundleUri":["s3://<artifact-bucket>/staging/<git-sha>/qdoc-ops.tar.gz"],"imageTag":["<git-sha>"],"expectedAppSha256":["<app-artifact-sha256>"],"expectedOpsSha256":["<ops-bundle-sha256>"]}'
```

The SSM command runs as root, requires app and ops artifacts to come from the trusted bucket recorded in `/opt/qdoc/shared/deploy-bucket`, downloads and verifies `qdoc-ops.tar.gz` from the same S3 prefix, validates the ops bundle against an explicit allowlist, extracts it to `/opt/qdoc/releases/<git-sha>`, then runs the bundled `deploy/deploy-from-s3.sh`. The deploy script serializes deployments with a host lock, downloads `qdoc-app.tar.gz.sha256`, verifies the image artifact against the workflow-provided digest before loading it into Docker, forces the web bind to loopback, waits for Compose services to become healthy, and updates `/opt/qdoc/current` after success. Update `deploy/ssm/qdoc-staging-deploy.yaml` whenever a new file is added to the staged ops bundle.

Verify the path before testing in a browser:

```bash
curl -I "http://127.0.0.1:${QDOC_WEB_PORT}"
curl -Iv https://qdoc.example.com
cd /opt/qdoc/current
docker compose -f compose.staging.yaml --env-file /opt/qdoc/shared/.env.staging ps
docker compose -f compose.staging.yaml --env-file /opt/qdoc/shared/.env.staging logs -f web api worker
```

Or run the bundled staging verifier from the current release:

```bash
cd /opt/qdoc/current
QDOC_PUBLIC_URL=https://qdoc.example.com bash deploy/verify-staging.sh
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_VERIFY_OUTBOX=true bash deploy/verify-staging.sh
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_VERIFY_OUTBOX=true QDOC_VERIFY_OPS=true QDOC_VERIFY_ADMIN_DATA=true QDOC_VERIFY_LAUNCH=true QDOC_VERIFY_EMAIL=true bash deploy/verify-staging.sh
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_VERIFY_EMAIL=true QDOC_VERIFY_SMTP_CONNECTIVITY=true bash deploy/verify-staging.sh
```

The verifier checks the Compose service state, healthchecks for web/API/worker/PostgreSQL/Redis, the loopback web endpoint, API health and readiness from inside the private Compose network, and the public Caddy route when `QDOC_PUBLIC_URL` is set. `QDOC_VERIFY_OUTBOX=true` runs the scoped outbox processor verification against the staging database. `QDOC_VERIFY_OPS=true` runs the safe operational summary for queue, notification, outbox, and map guardrail state. `QDOC_VERIFY_ADMIN_DATA=true` checks launch-critical organization, clinic, queue, staff access, and map budget records without printing sensitive fields. `QDOC_VERIFY_LAUNCH=true` runs the fail-closed launch hardening checks for secrets, OTP debug flags, SMTP readiness, web binding, and map budget controls. `QDOC_VERIFY_EMAIL=true` runs the safe email-delivery readiness check from the worker image; add `QDOC_VERIFY_SMTP_CONNECTIVITY=true` only when live SMTP connectivity/auth verification is approved for the staging provider.

Bounded load and failure drills:

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com bash deploy/load-failure-drills.sh
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_DRILL_REQUESTS=24 QDOC_DRILL_TIMEOUT_SECONDS=5 bash deploy/load-failure-drills.sh
```

The drill script is intentionally staging-scale. It caps `QDOC_DRILL_REQUESTS` at 60, performs repeated GET probes against the loopback web app, API `/health`, API `/ready`, patient `/sites`, and the optional public Caddy route, then runs scoped outbox, operational, admin-data, and launch-hardening verifiers from the deployed worker image. It does not send real OTP or SMTP traffic, does not mutate clinic queues, and does not disable providers. For command validation without touching containers, run:

```bash
QDOC_DRILL_DRY_RUN=true bash deploy/load-failure-drills.sh
```

Pass criteria:

- All bounded HTTP probes return success within `QDOC_DRILL_TIMEOUT_SECONDS`.
- `pnpm verify:outbox` passes from the worker image, including success, retry, and failed outbox transitions on scoped verification rows.
- `pnpm verify:ops` reports no stale processing outbox jobs, failed notification jobs, failed almost-ready email jobs, or map guardrail attention states.
- `pnpm verify:admin-data` and `pnpm verify:launch` pass without printing secrets, OTPs, patient payloads, or raw database URLs.

Failure-mode expectations:

- Email provider failure: `verify:launch` blocks launch-like environments unless SMTP is configured with non-placeholder values, `verify:email` distinguishes API OTP delivery gates, worker delivery gates, SMTP shape, placeholder values, and optional SMTP connectivity/auth failures, and `verify:ops` reports failed almost-ready email jobs. OTP request counters still protect normal request volume, while SMTP delivery failures use a short delivery-unavailable backoff with retry timing so first-time visitors do not see a misleading `rate_limited` response immediately after a failed provider attempt. Restore SMTP settings, restart API/worker, rerun `QDOC_VERIFY_EMAIL=true bash deploy/verify-staging.sh`, and then verify a real first-time OTP inbox receipt.
- Redis outage: API `/ready` should fail because OTP abuse-control counters are not available. Restore Redis, restart affected services if needed, and rerun `deploy/verify-staging.sh`.
- Map guardrail exhaustion: map config/usage should fail closed once the QDoc monthly hard limit is exhausted, and `verify:ops` should report the budget attention state. Keep maps disabled or raise the approved limit only after provider console restrictions are confirmed.
- Worker processing failure: `verify:outbox` and `verify:ops` should identify stuck, retrying, or failed outbox work. Inspect worker logs, fix the provider or database issue, restart worker, and rerun the verifiers.
- Database readiness failure: API `/ready`, `verify:ops`, and admin-data checks should fail. Restore database connectivity or recover from backup, then rerun the full staging verifier.

Patient OTP/check-in and staff ticket transitions should be smoke-tested manually in staging only when real email delivery is approved. For automated mutation coverage, use `pnpm e2e` against a local or isolated test database.

Launch-candidate staging rehearsal:

```bash
cd /opt/qdoc/current
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_EXPECTED_RELEASE_SHA=<git-sha> QDOC_EXPECTED_APP_IMAGE=qdoc-app:<git-sha> bash deploy/staging-rehearsal.sh
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_REHEARSAL_BACKUP=true QDOC_BACKUP_DIR=/opt/qdoc/backups bash deploy/staging-rehearsal.sh
QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_REHEARSAL_LOAD_DRILLS=true bash deploy/staging-rehearsal.sh
```

The rehearsal validates the Compose configuration, optional release-directory SHA, optional app image tag, public route requirement, full staging verifier, outbox verification, operational checks, launch hardening checks, and safe email delivery readiness checks. When `QDOC_REHEARSAL_BACKUP=true`, it also creates a PostgreSQL custom-format backup and restores it into a temporary database through `deploy/db-restore-check.sh`; it never restores the primary database. When `QDOC_REHEARSAL_LOAD_DRILLS=true`, it also runs the bounded load/failure drill script after the main verifier.

Use the 40-character candidate Git SHA in both `QDOC_EXPECTED_RELEASE_SHA` and `QDOC_EXPECTED_APP_IMAGE=qdoc-app:<git-sha>`. The literal `<git-sha>` placeholder is never valid. The rehearsal script exports `QDOC_APP_IMAGE` from `QDOC_EXPECTED_APP_IMAGE`, so the shared staging env file does not need to be edited for each release.

To print the exact evidence commands for the current candidate without contacting staging, SMTP, AWS, Docker, or a map provider:

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com pnpm portfolio:evidence-commands
```

The command plan fills the candidate SHA from `git rev-parse HEAD` when available, carries `QDOC_ADMIN_DATA_EXPECT_SITE_IDS` into the staging verifier and staff bootstrap examples, warns when the local branch is still ahead of its upstream, and prints the ordered public release preflight, browser smoke, staging verifier, staff bootstrap, staff/admin expectation verifier, rehearsal, smoke rollup, and release evidence preflight commands. It is read-only; it does not replace pushing the candidate, waiting for the staging deploy, or proving `/api/release` matches the same SHA.

Validate the command-plan helper locally without contacting external services:

```bash
pnpm portfolio:evidence-commands:self-test
```

For local command validation without running staging containers:

```bash
QDOC_ENV_FILE=.env.staging.example QDOC_REHEARSAL_DRY_RUN=true QDOC_REHEARSAL_REQUIRE_PUBLIC_URL=false bash deploy/staging-rehearsal.sh
```

Release evidence preflight:

```bash
QDOC_PUBLIC_URL=https://qdoc.example.com \
QDOC_EXPECTED_RELEASE_SHA=<git-sha> \
QDOC_EXPECTED_APP_IMAGE=qdoc-app:<git-sha> \
QDOC_APP_ARTIFACT_URI=s3://<artifact-bucket>/staging/<git-sha>/qdoc-app.tar.gz \
QDOC_OPS_BUNDLE_URI=s3://<artifact-bucket>/staging/<git-sha>/qdoc-ops.tar.gz \
QDOC_APP_ARTIFACT_SHA256=<app-artifact-sha256> \
QDOC_OPS_BUNDLE_SHA256=<ops-bundle-sha256> \
QDOC_SSM_COMMAND_ID=<ssm-command-id> \
QDOC_BACKUP_PATH=/opt/qdoc/backups/<backup-file>.dump \
QDOC_ROLLBACK_SHA=<known-good-sha> \
QDOC_ROLLBACK_APP_ARTIFACT_URI=s3://<artifact-bucket>/staging/<known-good-sha>/qdoc-app.tar.gz \
QDOC_ROLLBACK_OPS_BUNDLE_URI=s3://<artifact-bucket>/staging/<known-good-sha>/qdoc-ops.tar.gz \
QDOC_ROLLBACK_BACKUP_PATH=/opt/qdoc/backups/<known-good-backup-file>.dump \
bash deploy/release-evidence.sh
```

The evidence helper is read-only. It validates SHA, image tag, artifact URI, checksum, rollback, backup, and evidence status formats, then prints a commit-safe decision-record block for `docs/release-go-no-go.md`. Private operational identifiers are redacted by default; set `QDOC_EVIDENCE_PRIVATE_OUTPUT=true` only for local/private release notes that will not be committed. Use `QDOC_EVIDENCE_STRICT=true` for final GO evidence; strict mode fails while required package statuses or staging/manual proof remain pending.

Portfolio smoke evidence rollup:

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

This helper is also read-only. It turns P5-A through P5-D manual smoke outcomes into the `QDOC_EVIDENCE_P5A_STATUS`, `QDOC_EVIDENCE_P5B_STATUS`, `QDOC_EVIDENCE_P5C_STATUS`, `QDOC_EVIDENCE_P5D_STATUS`, and `QDOC_EVIDENCE_MANUAL_SMOKE_STATUS` values used by the release evidence preflight. Set `QDOC_SMOKE_STAFF_ADMIN_DATA=passed` only after staging admin-data verification passed with `QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL"` configured for the real staff/admin inbox. Set the tester membership, role-boundary, queue-control, patient status revisit, and audit-log values only after those exact UI paths were exercised with the deployed public URL. Use `pending`, `not_run`, or `failed` for anything that has not been proven in staging with real inboxes, public browser/provider behavior, and deployed worker/outbox behavior.

Useful SSM and host checks:

```bash
aws ssm list-command-invocations --command-id <command-id> --details
aws ssm get-command-invocation --command-id <command-id> --instance-id <instance-id>
cd /opt/qdoc/current
docker compose -f compose.staging.yaml --env-file /opt/qdoc/shared/.env.staging ps
docker compose -f compose.staging.yaml --env-file /opt/qdoc/shared/.env.staging logs --tail=200 web api worker
curl -fsSI "http://127.0.0.1:${QDOC_WEB_PORT}"
curl -fsSI https://qdoc.example.com
```

Rollback:

1. Pick a previously verified 40-character Git SHA whose `staging/<sha>/qdoc-app.tar.gz`, `staging/<sha>/qdoc-ops.tar.gz`, and checksum files still exist in the private deployment bucket.
2. Re-run the SSM document with `appArtifactUri`, `opsBundleUri`, `imageTag`, `expectedAppSha256`, and `expectedOpsSha256` for the known-good release.
3. Run `cd /opt/qdoc/current && QDOC_PUBLIC_URL=https://qdoc.example.com bash deploy/verify-staging.sh`.
4. If the rollback crosses database migrations, check the migration contents first. The current MVP deploy path only runs forward Prisma deploy migrations and does not implement automatic down migrations.

Admin data operations:

1. Classify the operation before changing data:
   - Seed-only: `pnpm db:seed` and `pnpm db:seed:staging` create the demo organization, clinic sites, queues, configured staff admin accounts, sample tickets, and disabled map provider guardrail rows. Use these for local or approved staging bootstrap only, not production onboarding. Set `QDOC_SEED_STAFF_ADMIN_EMAILS` to real OTP-receivable staff emails for staging; staging seed fails closed when this is missing or uses example-domain placeholders.
   - Staff-admin bootstrap: `pnpm db:bootstrap-staff-admins`, `pnpm db:bootstrap-staff-admins:staging`, or `bash deploy/bootstrap-staff-admins.sh` adds or promotes real staff/admin emails on existing sites without resetting tickets, queues, map settings, or provider guardrail rows. The command prints counts and site IDs, not email addresses. `pnpm verify:staff-bootstrap` checks the bootstrap input policy and deployed wrapper defaults without connecting to the database.
   - Application-supported: staff admins can manage site settings, notification threshold, queue open/closed state, site memberships, audit-log review, and notification health from `/staff`. Operators listed in `MAP_SETTINGS_ADMIN_EMAILS` can manage global map provider enablement, monthly map-load limits, monthly place-search limits, and hard-stop settings from the staff UI.
   - Database-admin-only: new production organization/site/queue creation, destructive record cleanup, direct restore, and emergency data correction require an approved DB-admin procedure or a reviewed script. Do not bypass staff authorization boundaries from the public API.
2. After migrations and approved seed/bootstrap data are applied, sign in as a site admin, verify every launch clinic has the expected address and coordinates, set `notificationAheadCount`, confirm at least one queue exists, and confirm at least one real OTP-receivable admin membership per site.
3. Keep map providers disabled until provider console restrictions, browser credentials, monthly QDoc limit, and QDoc hard-stop settings are all configured. If a provider is enabled, `monthlyMapLoadLimit` must be positive and `hardStopEnabled` must stay true.
4. Run the admin data verifier:

```bash
QDOC_BOOTSTRAP_STAFF_DRY_RUN=true QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-waterloo,site-kitchener,site-university pnpm db:bootstrap-staff-admins
QDOC_BOOTSTRAP_STAFF_CONFIRM=apply QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-waterloo,site-kitchener,site-university pnpm db:bootstrap-staff-admins
QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-waterloo,site-kitchener,site-university bash deploy/bootstrap-staff-admins.sh
QDOC_BOOTSTRAP_STAFF_CONFIRM=apply QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" QDOC_BOOTSTRAP_STAFF_SITE_IDS=site-waterloo,site-kitchener,site-university bash deploy/bootstrap-staff-admins.sh
pnpm verify:staff-bootstrap
pnpm verify:admin-data
QDOC_ADMIN_DATA_EXPECT_SITE_IDS=site-waterloo,site-kitchener,site-university pnpm verify:admin-data
QDOC_ADMIN_DATA_EXPECT_SITE_IDS=site-waterloo,site-kitchener,site-university QDOC_ADMIN_DATA_EXPECT_STAFF_ADMIN_EMAILS="$REAL_STAFF_EMAIL" pnpm verify:admin-data
```

5. Exercise the failure path without mutating data:

```bash
QDOC_ADMIN_DATA_EXPECT_SITE_IDS=missing-launch-site pnpm verify:admin-data
```

The failure-path command should exit non-zero and print only safe JSON counts, statuses, site IDs/names, queue IDs/names, and map guardrail fields.

Database backup and restore:

1. Create a PostgreSQL custom-format backup from the running Compose database:

```bash
QDOC_BACKUP_DIR=/opt/qdoc/backups bash deploy/db-backup.sh
```

The backup script defaults to `compose.staging.yaml` and uses `.env.staging` when it exists in the current directory, otherwise `/opt/qdoc/shared/.env.staging`. For local verification, point it at the local Compose stack:

```bash
QDOC_COMPOSE_FILE=compose.yaml QDOC_ENV_FILE=.env QDOC_BACKUP_DIR=/tmp/qdoc-backups bash deploy/db-backup.sh
```

2. Copy the backup to encrypted off-host storage controlled by the operating AWS account. Backup files contain patient, staff, queue, audit, notification, and OTP challenge metadata, so do not place them in Git, public buckets, screenshots, chat logs, or workflow artifacts. The repository ignores `backups/`, but that is only a local safety net.
3. Verify that a backup can be restored into a temporary database without changing the primary database:

```bash
QDOC_COMPOSE_FILE=compose.yaml QDOC_ENV_FILE=.env bash deploy/db-restore-check.sh /tmp/qdoc-backups/<backup-file>.dump
```

4. Restore the primary database only during an approved recovery window. The restore is destructive and requires an explicit confirmation variable:

```bash
QDOC_RESTORE_CONFIRM=restore-qdoc bash deploy/db-restore.sh /opt/qdoc/backups/<backup-file>.dump
```

5. After restore, run `QDOC_PUBLIC_URL=https://qdoc.example.com QDOC_VERIFY_OUTBOX=true QDOC_VERIFY_OPS=true QDOC_VERIFY_ADMIN_DATA=true QDOC_VERIFY_LAUNCH=true bash deploy/verify-staging.sh` and complete the manual patient and staff smoke checks.

Launch hardening checklist:

1. Public exposure matches the documented boundary: only host Caddy listens on public `80/443`; `compose.staging.yaml` publishes web to `127.0.0.1:${QDOC_WEB_PORT}`; API, PostgreSQL, Redis, worker, migrate, and seed are private Compose services.
2. `pnpm verify:launch` passes with the staging or production environment loaded. In launch-like environments, `APP_URL` must be HTTPS, `SESSION_SECRET` must be a long non-placeholder value, `QDOC_WEB_BIND` must stay `127.0.0.1`, OTP debug flags must be disabled, OTP request/verify abuse limits must be positive, and SMTP must be configured.
3. Map providers stay disabled until provider console restrictions, browser credentials, `MAP_MONTHLY_MAP_LOAD_LIMIT`, and QDoc map usage rate limits are configured. Nearby healthcare search stays disabled until server-side search credentials, `MAP_MONTHLY_PLACES_SEARCH_LIMIT`, search rate limits, and cache TTL are configured. When a provider is enabled, QDoc refuses map loads and provider searches after the configured monthly hard limits are exhausted.
4. Backup and temporary-restore verification has passed for the environment being launched.
5. Load and failure smoke checks have no launch blockers: patient OTP/check-in, staff ticket transitions, SSE queue stream, worker retry behavior, map guardrail exhaustion, and public route health all behave as expected for initial usage.
6. Rollback artifact and matching database backup are available before deployment, and the operator knows whether the release includes forward-only database migrations.
7. Incident response starts with `deploy/verify-staging.sh`, service logs, `pnpm verify:ops`, and public Caddy checks; do not print secrets or OTP codes while collecting diagnostics.

Artifact retention:

- GitHub Actions keeps the compressed image workflow artifact for 3 days.
- Configure the private S3 bucket lifecycle to keep `staging/` artifacts for 14 days, with at least the last known-good artifact available until the next deploy is verified.
- The EC2 deploy script prunes unused Docker images after a successful Compose update, but rollback should use the S3 artifact as the source of truth.
- Store database backups in encrypted off-host storage with an account-level retention policy. Keep at least one known-good backup for the currently running release until the next deployment and verification are complete.

Deployment artifact review:

The single Docker image artifact is still acceptable for the MVP because web, API, worker, migrate, and seed are built from the same monorepo revision and the EC2 host performs no build work. Split artifacts can be revisited when independent service scaling, image size, rollout isolation, or separate security boundaries become more important than the added release orchestration.
