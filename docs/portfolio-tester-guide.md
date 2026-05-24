# Portfolio Tester Guide

This guide is for invited portfolio testers who need to exercise QDoc from the public web UI. It does not replace the operator release checklist in `docs/release-go-no-go.md`; use that checklist to record evidence, deployment identity, backup, rollback, and the final GO/NO-GO decision.

Use this guide only after the operator confirms that the public URL is serving the expected candidate release and that at least one real staff/admin tester email has been rostered.

## Before Testing

- Use the public portfolio URL confirmed by the operator.
- Use only an inbox you control. Never paste OTP codes, SMTP settings, cookies, logs, or secrets into issue notes.
- Patient testing can use a normal email inbox.
- Staff testing requires an email that has been added to a site roster by seed bootstrap, staff-admin bootstrap, or the staff membership UI.
- A personal email that is not rostered should be denied staff access with readable copy. That is expected behavior.
- If provider-backed maps are enabled, browser location permission should center the map near the tester. If location is denied or the provider is disabled, the UI should fail closed with readable copy.

## Patient Smoke Path

1. Open the public patient app.
2. If prompted, allow location permission when testing map geolocation. Also note whether denied permission still leaves a readable fallback.
3. Confirm the map can move, zoom, recenter to current location when available, and keep selected markers/cards in sync.
4. Confirm QDoc check-in clinics are visually distinct from third-party provider discovery places when provider discovery is enabled.
5. Request a patient email OTP.
6. Enter the code from the inbox.
7. Select a QDoc clinic and queue.
8. Check in and confirm the active ticket panel is understandable.
9. Refresh or reopen the app and confirm the signed-in/ticket state still makes sense.
10. Review notification preference or notification status surfaces if they are shown.

## Staff Smoke Path

1. Open `/staff` on the public site.
2. Sign in with the rostered staff/admin tester email.
3. Confirm the staff page shows only authorized sites and queues.
4. With a test ticket, exercise call, start service, complete, delay, restore, and cancel where the ticket state allows it.
5. Verify queue open/close controls and notification threshold controls if the signed-in role can access them.
6. If signed in as admin, add or update a tester membership through the UI, then confirm role boundaries and audit-log visibility.
7. Try an unrostered personal email only as a negative test. It should not gain staff access.
8. After an almost-ready action, ask the operator to verify deployed worker/outbox evidence. Testers should not inspect private logs directly.

## Error Copy Checks

User-facing screens should explain what to do next. They should not display raw internal tokens such as:

- `rate_limited`
- `otp_delivery_unavailable`
- `invalid_otp`
- `expired_otp`
- `map_provider_disabled`
- `map_budget_exhausted`
- `queue_closed`
- `invalid_request`
- `invalid_transition`
- `internal_error`
- `not_found`
- `unauthorized`
- `forbidden`

The map should also avoid implementation-only cost-guard labels such as "cost guard active".

## Stop Conditions

Stop the smoke run and report a blocker if any of these happen:

- The operator has not confirmed the public URL is serving the expected candidate release.
- OTP email does not arrive for a first-time patient or rostered staff tester.
- An unrostered email gains staff access.
- A visible staff action button does nothing or leaves the queue in an unclear state.
- The map is expected to be provider-backed but cannot move, zoom, recenter, or synchronize marker/card selection.
- Raw internal error tokens are visible in the UI.
- Evidence collection asks for OTP codes, cookies, SMTP secrets, provider keys, database URLs, or private logs.

## Safe Tester Notes

Return a short pass/fail note for P5-A through P5-D, the browser/device used, and any UI text that was confusing. Redact email addresses, OTP codes, patient details, and private host or provider identifiers from screenshots and notes.
