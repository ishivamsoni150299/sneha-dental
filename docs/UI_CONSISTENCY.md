# Application consistency work

Scope: simplify existing screens and shared architecture. Do not add product
features as part of this work. Commit and push each verified batch.

The canonical visual primitives live in `src/design-system.css`, with semantic
Tailwind colors in `tailwind.config.cjs`. Reuse `ui-btn`, `ui-field`, `ui-card`,
`ui-alert`, and interface headings rather than copying local control styles.

## Coverage and remaining work

| Screen family | Completed consolidation | Remaining verification / cleanup |
| --- | --- | --- |
| Patient, dentist, clinic and platform sign-in; account recovery | Shared authentication controls, cards and responsive layout | Live identity flows; remove remaining legacy recovery styles after migrating their consumers |
| Clinic onboarding | Shared shell, progress, hours controls, submission errors | Theme/service/plan options and preview; real provisioning and payment |
| Marketplace directory, profile, booking, treatment pages | Shared neutral palette | Populated search, booking, filters, responsive controls and failure states |
| Patient appointments | Shared controls, cards, errors, headings and neutral palette; populated/cancel/review/reschedule presentation checked | Live linking, mutations and video consultation states |
| Dentist workspace and embedded profile | Shared controls, cards, errors, headings and neutral palette; expanded profile, hours with breaks and decline presentation checked | Live profile/verification/appointment mutations; video consultation states |
| Clinic doctor management | Shared actions and labeled fields; schedule layout aligned with dentist workspace | Full keyboard modal lifecycle; live scheduling conflicts and authorization |
| Clinic dashboard, settings, patients and reviews | Shared neutral palette; inverse text in dark panels | Dialogs, populated tables, forms and field labels |
| Platform clinics, leads, verification, analytics, revenue and reviews | Shared neutral palette | Consistent actions, filtering, editing, populated tables and failure states |
| Tenant website, contact and legal pages | Shared neutral palette where applicable; contact rendering repaired | Complete control and responsive visual audit without expanding compatibility routes |
| Video tests and consultation overlays | Partial neutral palette adoption | Permission, device, disconnected, joining and active-call states |

## Verification standard

- Check mobile and desktop, including 320px layouts for forms and actions.
- Check visible component content and Angular console errors; a rendered shell
  and a lack of `pageerror` events alone do not prove a working screen.
- Exercise populated, empty, loading, failure and editing states as applicable.
- Preserve tenant scope, session revocation, consent and verified identity.
- Run focused tests, lint and a production build before committing.
- Clearly distinguish intercepted local UI fixtures from live end-to-end tests.

The September 28 baseline checked 46 route fixtures at 390 and 1440px. It found
and repaired the contact-page injection failure. The fixtures mostly exercised
empty states; this baseline does not certify every screen or workflow.
Detailed completed batches are recorded in `DESIGN_SYSTEM.md`.
