# Cross-page UX consolidation

This batch consolidates UX changes for combined review. It preserves Angular, the existing design system, backend APIs, tenant permissions, and appointment ownership rules.

## Changes

- Clinic and platform forms: accessible names now match visible labels. Settings phone/bio fields are named, and switching to Contact no longer forces focus into the phone field.
- Clinic workspace: patient search has a persistent accessible name; Patients has a real heading and a compact mobile header. Patient reviews is directly reachable from the dashboard navigation. The mobile navigation button exposes its name and expanded state.
- Platform administration: use compact navigation through tablet widths; keep clinic save controls above that navigation. Clinic status filters and clinic-form sections wrap. Removed the competing setup badge and implementation terminology from clinic creation.
- Patient booking: confirmation copy clearly distinguishes a request from a confirmed visit. Removed a guaranteed response-time claim. Account descriptions explain email sign-in instead of phone-only or reference-only access.
- Dentist workspace: signup and appointment cancellation labels state the action directly.
- Clinic website: About, Gallery, Services, Contact, Reviews, and Not Found headings identify the page directly. Native expandable sections use the shared keyboard focus ring.

## Page coverage

| Surface | Pages and variants inspected by the browser checks |
| --- | --- |
| Clinic website | Home, services, about, gallery, testimonials, contact, appointment request, request receipt, appointment account, privacy, terms, coming soon, not found |
| Patient marketplace | Directory; city and treatment variants; clinic and dentist profile aliases; booking; patient appointments |
| Shared account entry | Dentist landing/signup/login, clinic landing/signup/login, platform login, recovery |
| Clinic workspace | Dashboard; settings profile/contact/hours/services/testimonials/social/theme/logo/subscription; doctors; patients; reviews |
| Platform administration | Clinics; create/edit clinic; dentist verification; review moderation; analytics; revenue; leads; create lead; lead discovery |
| Dentist workspace | Profile, appointments, hours, standalone profile, video test |
| Video | Public and dentist video-test entry pages; booking flow, with isolated configuration |

Locality/treatment URL aliases reuse the directory component. Lead create/edit reuse the lead form; editing an existing lead was not a separate browser transaction in this pass. Redirect-only legacy password/admin URLs and the subscription-expired guard retain their existing behavior. Dormant, unrouted components were not expanded.

## Verification

- 176 frontend tests passed.
- Production build (28 prerendered routes), lint, and diff whitespace checks passed.
- 180 browser route/layout checks passed: 60 page/tab states at 1440px, 768px, and 320px. These checks confirm page rendering, a heading, no document-wide horizontal overflow, no uncaught browser errors, and no unexpected login fallback on authenticated routes. They do not certify every interaction or full accessibility compliance.
- Existing Playwright transactions passed: secure guest claim/linking; patient reschedule/cancel; clinic confirm/complete; completed-visit review; moderation and clinic response; dentist verification; independent video booking/account visibility; subscription cancellation confirmation/backout and safe provider-unavailable error.
- Manual checks: settings desktop/mobile, keyboard setup disclosure, section switching, clinic mobile menu and patient-review destination. This resolves the settings visual-verification gap from the previous pass.
- Test reruns use unique dentist registration numbers and check exclusion of the current unverified fixture without assuming the entire database is empty. Route checks wait for rendered headings rather than network idleness, which background requests can prevent.

Run the expanded local browser pass with the same isolated database/environment variables as CI, plus `E2E_UX_AUDIT=1`, using `npm run test:e2e`. Never point this suite at production. Test emails are captured; video settings use a dummy provider endpoint.

Logs and screenshots are local, untracked artifacts under `artifacts/clinic-ux` and `artifacts/ux-route-checks`. Screenshots 04-settings-desktop, 05-settings-mobile, and 06-reviews-mobile provide visual evidence.

## Release limits

No production deployment or production data changes occurred. Real payment settlement, outbound email delivery, live video media transport, backup restoration, and the previously documented dependency upgrade remain separate release checks. This UX pass does not certify the entire project as production-ready.
