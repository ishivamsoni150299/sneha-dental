# Full marketplace launch

Scope: public dentist discovery, independent dentist accounts, clinic onboarding and subscriptions, patient booking and appointment management, video consultations with chat and prescription sharing, and platform administration.

The application is a modular monolith: one Angular frontend, one Spring Boot API, one PostgreSQL database. Angular talks only to Spring. Flyway owns schema history. JDBC is the persistence layer; JPA and the unused Node SMTP implementation have been removed. Shared authentication components own login and signup UI.

## Repeatable local gate

Use Node 22, Java 25+ and Chrome, then `npm ci` and `npm run verify`. CI runs the same command. Tests create and destroy their own PostgreSQL database; they do not read production credentials, send email, charge cards, or create real video rooms.

Database journeys cover fresh migrations, health, administrator login, patient signup, clinic signup/onboarding, stale-session rejection, role isolation, patient listing with and without search, doctor scheduling, booking, duplicate-slot rejection, appointment ownership, independent dentist signup/workspace, and public directory queries. Email queue checks cover transaction rollback, duplicate suppression and delivery through a mocked transport.

`npm run test:artifacts` checks compiled assets only. The legacy `test:e2e` alias runs the same artifact check; it is not a browser journey test. `PUBLIC_BASE_URL=... npm run release:check` is a read-only deployment HTTP check.

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
