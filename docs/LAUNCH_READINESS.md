# Full marketplace launch

Scope: public dentist discovery, independent dentist accounts, clinic onboarding and subscriptions, patient booking and appointment management, video consultations with chat and prescription sharing, and platform administration.

## Release hardening — 9 November 2026

Changes prepared locally; this section does not assert they have been deployed.

- Angular runtime/compiler packages now require 20.3.35. Compatible lockfile
  updates remove the reported runtime XSRF advisory and high-severity development
  dependency findings. Runtime audit: zero findings. Full audit: 26 moderate
  development-tool findings, zero high/critical. Further suggested fixes require
  breaking toolchain changes and have not been forced. CI's runtime audit now
  fails on moderate or higher findings.
- Patient booking-link failures stay beside the form. Changing the reference
  clears its previous challenge/code; refresh retains existing visits and rejects
  duplicate requests. Recovery inputs expose field-specific accessible feedback.
- Dentist profile load failures offer a retry rather than a blank editable form.
  Practice-loading errors are separate from appointment errors and can be retried.
  Verification submission prevents duplicate requests and shows review/verified
  state. Reloaded profile details refresh the workspace's setup status.
- Public page and asset HEAD requests are allowed through the same security
  boundary as GET; protected API HEAD requests remain authenticated. The release
  checker now rejects public pages whose HEAD requests return an error.
- Prerendered dentist, home and legal pages now respect configured static-resource
  locations, consistently with other platform pages. The built frontend served
  by local Spring passes the strengthened GET/HEAD/asset/API release checks.
- Browser tests follow current role-specific signup destinations, expand visit
  details before reading booking references, select All visits for future clinic
  appointments, and refresh availability before making a second booking. The
  route audit uses a fresh page within each role's context and covers 320, 390,
  768 and 1440 pixels; screenshot failures no longer hide the original failure.

Local evidence: clean dependency installation, lint, 333 Angular tests,
production build, compiled-asset checks and the full verification command passed.
The HEAD and static-location regressions have dedicated backend coverage;
the final backend verification ran 198 tests with zero failures/errors and one
production-only test skipped. All ten deployment-check tests passed.
Focused fixture browser checks covered recovery validation and profile retry at
320/390/768/1440px, with mobile screenshots reviewed. These checks do not establish
physical-device keyboard or external-service reliability.

The isolated Spring/PostgreSQL browser suite passed booking, guest email-code
linking, patient rescheduling/cancellation, clinic confirmation/completion,
review moderation/response, dentist verification, video-booking account flow,
unconfigured subscription-cancellation error handling and all three signup
journeys. All 288 route/viewport checks passed across public, clinic, platform
and dentist routes at the four widths above. Populated mobile clinic, platform
and dentist screenshots were reviewed. CI now enables this responsive audit.
SMS was simulated, email was captured in the disposable outbox, and video media
and live payment providers were not contacted.

Read-only production evidence: `https://mydentalplatform.com` passed the existing
GET/asset/API HTTP checks on 9 November. Its health response identified healthy
Spring/PostgreSQL. A separate HEAD request to `/appointments` returned 401;
the local fix still needs deployment and the strengthened release check repeated.
The earlier connection timeouts did not recur in this check.

Live checkout/webhooks, delivered recovery/booking/reminder emails, real-device
video, backup restoration, rollback and operational ownership remain the
production acceptance requirements listed below.

The application is a modular monolith: one Angular frontend, one Spring Boot API, one PostgreSQL database. Angular talks only to Spring. Flyway owns schema history. JDBC is the persistence layer; JPA and the unused Node SMTP implementation have been removed. Shared authentication components own login and signup UI.

## Launch hardening — 14 October 2026

The frontend now uses Angular 20.3 with matching compiler/build tools and
TypeScript 5.9. Angular 19's published releases were affected by runtime security
advisories with no patched 19.x release. The upgrade includes the server-rendering
provider migration and preserves conditional platform/clinic home routing.
`npm run audit:runtime` checks production dependencies and now runs in CI.

The Spring page routes explicitly include `/mili`, `/book`, and `/workspace`.
Previously these paths returned 401 for unauthenticated requests without an HTML
Accept header. Browser HTML fallback did not cover link-checking clients. The
deployment HTTP gate and backend regression tests now cover all three paths;
protected APIs retain their existing authentication and role checks.

Clinic rescheduling invalidates old doctor/availability requests when another
dialog opens. Late responses cannot populate the new appointment or replace its
error state. Failed availability no longer also claims that no slots exist.

Validation: 306 frontend tests, lint, the Node 22 production build, artifact checks,
and nine deployment-gate tests passed. Backend verification ran 188 tests with no
failures and one production-only test skipped; the fresh-database production-profile
route test also passed separately. The runtime dependency audit reported zero
known vulnerabilities. The full audit still reported 14 development-tool findings
(10 high, four moderate).

Isolated browser journeys completed booking, guest claiming, rescheduling,
cancellation, clinic confirmation/check-in/completion, review moderation/response,
unconfigured billing error handling, and all three signup/workspace paths. The
extended route audit passed 186 viewport/route checks before Chromium crashed;
the remaining platform mobile and dentist audit checks are not certified by that
run. SMS, email transport, payments and video media were not exercised against live
providers.

Mobile usability follow-up (16 October): patient recovery and sign-out share an
Account menu, and the account identity appears once in the heading. Dentist setup
keeps the next action visible while the detailed checklist expands on demand.
The embedded profile no longer repeats the page title, and its optional photo
upload expands on demand so required details appear earlier on small screens.
Focused browser checks passed at 320, 390, 768 and 1440 pixels, including Account
menu Escape/focus behavior, recovery navigation, checklist/photo expansion and
horizontal overflow. These presentation checks use local fixtures.

This is not launch certification. The production integration acceptance items
below remain required. The full dependency audit also reports development-tool
advisories, separately from the production dependency audit; keep development
servers private and review those upgrades before accepting untrusted build input.

## Repeatable local gate

Use Node 22, Java 25+ and Chrome, then `npm ci` and `npm run verify`. CI runs the same command. Tests create and destroy their own PostgreSQL database; they do not read production credentials, send email, charge cards, or create real video rooms.

Database journeys cover fresh migrations, health, administrator login, patient signup, clinic signup/onboarding, stale-session rejection, role isolation, patient listing with and without search, doctor scheduling, booking, slot-hold ownership/expiry/release, reserved-slot reschedule rejection, duplicate-slot rejection, appointment ownership, independent dentist signup/workspace, and public directory queries. Email queue checks cover transaction rollback, duplicate suppression and delivery through a mocked transport.

`npm run test:artifacts` checks compiled assets only. `npm run test:e2e` runs Playwright browser journeys through `scripts/browser-e2e.mjs`; it requires `E2E_ISOLATED_DB=1`, a loopback API backed by disposable PostgreSQL, a running Angular app, and bootstrap administrator credentials (see CI). The suite covers unverified marketplace exclusion, platform-admin dentist approval, authenticated and guest appointment ownership, secure email-code claim, patient reschedule/cancel, clinic confirm/complete, patient review, platform moderation, clinic response, video-booking state, and subscription-cancellation confirmation/error UI. CI uses `EMAIL_CAPTURE_ONLY=true` so claim messages remain in the disposable outbox and are never delivered externally. `PUBLIC_BASE_URL=... npm run release:check` is a read-only deployment HTTP check.

`npm run preview:api` serves in-memory demo fixtures. The legacy `npm run test:live` command checks those fixtures through Angular's local proxy; passing it is not evidence that the production Spring APIs, authentication or database work. Use `npm run verify` for the real backend integration gate.

## Local setup

`docker compose up --build` starts PostgreSQL and the packaged application at http://localhost:8080. `docker compose up -d db` starts only the database for Angular/Spring development. This configuration uses local credentials and binds ports to loopback. Docker execution still needs verification on a machine with Docker installed.

Plain PostgreSQL needs `deploy/postgres/init.sql` applied by its database administrator before Flyway. It creates pgcrypto and the NOLOGIN compatibility roles referenced by historical policies. Supabase supplies those roles already. Do not rewrite migrations V1–V21 or expose the private production `dental` schema through a public database API.

## Notification delivery

V22 preserves legacy notification history and consolidates delivery into `notification_outbox`. New notifications are queued within the originating transaction; a rolled-back booking cannot produce an email. A worker claims one row at a time with a lease, retries failures up to three attempts, and sends the same provider idempotency key on retry. Reminders use their own key including appointment date, so confirmation emails do not suppress them.

When email is unconfigured, rows remain pending. Inspect counts by `status` and `attempts`; never treat queued as delivered. Investigate exhausted failures before manually resetting attempts. Do not blindly replay old messages: provider idempotency retention is limited. Legacy `notifications` remains audit history and is no longer a delivery queue.

## Production acceptance still required

Passing local tests is not full marketplace launch acceptance. Record evidence for each item against the actual deployment before inviting paying clients:

- HTTPS, DNS, wildcard/custom clinic domains, secure refresh cookies and session logout/recovery on the deployed origin. Production startup rejects test phone credentials, insecure cookies and the development JWT secret.
- A real clinic and independent dentist complete onboarding, verification/publication, profile discovery, schedule setup, booking, confirmation, rescheduling and cancellation. Test account separation across two clinics and two patients.
- Razorpay live subscription purchase, verified webhook processing, renewal/cancellation and failed-payment handling. Local tests do not validate merchant activation or live payment configuration.
- Resend sender/domain verification and actual receipt of password recovery, confirmation and next-day reminder emails. Confirm queue failures are monitored.
- Two separate devices join the same consultation, exchange chat and a prescription, reconnect, deny camera/microphone access, and end the call. Cover iPhone Safari, Android Chrome, tablet and desktop, including a small screen with the keyboard open. Automated browser unit tests do not establish real device/media reliability.
- A database backup is restored successfully, deployment rollback is rehearsed, and someone owns error/uptime alerts and support. Choose hosting capacity that meets the client response-time requirement; a sleeping development/free service is not a reliability guarantee.
- Review clinic content, real clinician credentials, prices, privacy/consent copy and operational support contacts. Remove sample claims before publication.

AI voice reception and outbound AI calling remain unavailable and are excluded from launch entitlements. Prescription sharing currently provides consultation chat and downloadable text; it is not a structured prescribing/signature workflow. Confirm that this matches the intended clinical workflow before launch.
