# QDoc Backend

Nest.js + Prisma backend service.

## Stack
- Nest.js 11
- Prisma ORM
- SQL Server (default runtime)
- Socket.IO WebSocket (`/queue` namespace)

## Quick Start
1. Copy `.env.example` to `.env`
2. Set a valid SQL Server `DATABASE_URL`
3. `npm install`
4. `npm run prisma:generate`
5. `npm run db:reset`
6. `npm run start:dev`

API base: `http://localhost:4000/api`

## SQL Server Connection
Use one of the following URL styles:
- SQL Login:
  - `sqlserver://localhost:1433;database=QDoc;user=sa;password=YourStrong!Passw0rd;encrypt=false;trustServerCertificate=true`
- Windows Integrated:
  - `sqlserver://localhost:10273;database=QDoc;integratedSecurity=true;encrypt=false;trustServerCertificate=true`

## Database and Seed Data
- Runtime schema source: `prisma/schema.prisma`
- Init/reset:
  - `npm run db:init` -> `prisma db push --accept-data-loss`
  - `npm run db:seed` -> seed demo data
  - `npm run db:reset` -> init + seed

Seed includes:
- 6 hospitals
- 11 departments
- 12 doctors
- sample customers/family members
- queue tickets/snapshots/notification logs

Schema SQL export:
- `npm run db:generate-sql` (writes `prisma/init.sql`)

## SQL Server Test Fixture (Requested)
- File: `backend/sql/qdoc-test-seed.sql`
- Content: `Clinics`, `PatientQueue`, `usp_JoinQueue`
- Example:
  - `SQLCMD.EXE -S .\SQLEXPRESS -E -i backend\sql\qdoc-test-seed.sql`

Note:
- The fixture is independent from Prisma runtime tables.
- If you run `db:init` on the same database, non-Prisma tables in that DB can be dropped.
- Keep fixture DB and runtime DB separated when needed.

## Main APIs
- Auth session: `GET /auth/session`
- Hospital search: `GET /hospitals/search`
- Hospital detail: `GET /hospitals/:hospitalId`
- Department list: `GET /hospitals/departments`
- Queue enroll: `POST /queues/tickets/enroll`
- Queue cancel: `POST /queues/tickets/:ticketId/cancel`
- Staff status update: `PATCH /queues/tickets/:ticketId/status`
- Symptom analysis: `POST /symptoms/analyze`
- UiPath snapshot ingest: `POST /uipath/snapshots`

## Auth
- Auth0 JWT validation requires all of: `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_JWKS_URI`
- Without a valid Bearer token, requests are rejected (fail-closed).
- Dev bypass is local-development only:
  - `AUTH_DEV_BYPASS=true`
  - blocked automatically when `NODE_ENV=production`
- Dev role header (bypass mode only): `x-dev-role: patient|staff|admin|robot`

## CORS
- `CORS_ORIGIN` must be an explicit origin allowlist (comma-separated).
- Wildcard `*` is blocked for HTTP and WebSocket origins.
