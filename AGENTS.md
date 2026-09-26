# Repository guide

My Dental Platform is a multi-tenant dental marketplace and clinic workspace. The frontend is Angular 19 with standalone components, signals, and Tailwind CSS 3. The backend is a Spring Boot 4.1 modular monolith on Java 25, PostgreSQL, JDBC, and Flyway. Do not use the old Sneha Dental brochure-site assumptions.

## Main domains

- Patient marketplace: `/dentists` and locality/treatment routes, dentist profiles, appointment requests, reviews, `/appointments` patient account.
- Dentist portal: `/professional` signup, profile, verification, locations, schedules, and workspace.
- Clinic portal: `/business`, signup, clinic dashboard, settings, billing, and platform administration.
- Legacy tenant website routes still exist under `/` and `/clinic/:slug`; avoid expanding compatibility code without a migration plan.

Backend packages under `backend/src/main/java/com/mydentalplatform/` include `auth`, `appointment`, `provider`, `marketplace`, `clinic`, `billing`, `notification`, `review`, `video`, and `config`. Database migrations are in `backend/src/main/resources/db/migration/`; add a new numbered migration rather than editing an applied one. The current API has both `/api/v1` marketplace routes and older `/api` routes.

## Security and product constraints

- Patient accounts currently use email and password. Test-only phone OTP is not a production identity method. A booking reference or unverified phone number alone must never establish appointment ownership.
- Clinic and dentist access is tenant scoped through JWT roles and verified sessions. Preserve live session revocation checks.
- Marketplace listings require genuine verification and publication. Keep demo profiles out of production API responses.
- The optional AI endpoints currently return 503. Do not present AI Voice as available or included in a paid plan until end-to-end delivery exists.
- Yearly Razorpay checkout is disabled. Public checkout and pricing should advertise monthly billing only until yearly plans work.
- Notification emails use a transactional outbox. WhatsApp links/routing are not automatic outbound WhatsApp booking alerts.

## Commands

```bash
npm start                       # Angular dev server on 4200; proxies /api to 8080
npm run lint
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
npm run test:artifacts          # compiled artifact smoke checks; not browser E2E
npm run test:e2e                # Playwright; requires E2E_ISOLATED_DB=1, isolated API/PostgreSQL and Angular on 4200 (see CI)
cd backend && mvn test          # Java tests, including embedded PostgreSQL tests
cd backend && mvn spring-boot:run
```

Review `src/app/app.routes.ts` and the controller annotations for current routes before changing navigation or API paths. Preserve unrelated working-tree edits. Use `apply_patch` for edits and verify changes with focused tests, lint, and builds appropriate to the affected code.
