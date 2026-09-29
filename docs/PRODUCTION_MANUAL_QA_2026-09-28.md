# Production manual QA — 2026-09-28

Target: https://mydentalplatform.com. Execution started with an interactive browser on 2026-09-28 and continued with a read-only Playwright production smoke suite on 2026-09-29. Automated smoke results cover repeatable rendering and layout checks; they do not substitute for transactional manual acceptance.

**Status: partial execution, not full production acceptance.** Public and platform-admin checks below were exercised. Complete transactional journeys remain blocked on role-specific test accounts, genuine provider verification, payment/device participation and external integration setup. No application behavior was changed or deployed; a local read-only production smoke runner was added for faster repeat checks.

## Fast repeatable checks

Run `$env:PUBLIC_BASE_URL='https://mydentalplatform.com'; npm run release:check` for the HTTP/API gate, then `$env:PUBLIC_BASE_URL='https://mydentalplatform.com'; npm run test:production:smoke` for headless browser checks. Both are read-only. The Playwright smoke suite checks ten desktop routes and five mobile routes for successful navigation, expected headings, Angular rendering, horizontal overflow and unexpected browser errors. It never signs in, submits forms, creates records, starts checkout or requests device access. Failures save screenshots under `artifacts/production-smoke/`.

## Preconditions and boundaries

- Production was just cleared: no clinics, providers, locations, appointments or non-admin users remain. One platform admin was preserved.
- Requested test email was among deleted accounts. Confirm correct administrator identity before using its credential. Never store passwords in this report.
- Label any new fixtures `QA 2026-09-28`; keep them unpublished/unverified. Do not falsely verify clinical credentials or publish fictitious dentists.
- Actual purchases, credential changes, acceptance of binding terms and device permissions may need user participation. Record these as blocked where necessary.
- Preserve the platform admin, schema, platform configuration and unrelated working-tree changes. Record and remove only test records created during this run using their exact IDs when authorized.

## Complete flow plan

| Area | Manual cases | Required evidence |
| --- | --- | --- |
| Entry/navigation | HTTPS; apex/www; root redirect; primary navigation; deep-link reload; back/forward; missing route; unknown clinic/provider; legacy redirects | Actual destination, rendered page and errors |
| Marketplace | Empty directory; keyword/location search; all locality/treatment routes; dentist/clinic tabs; visit/video toggle; fee/sort/availability filters; filter reset; cost guide; FAQ; notify link | Selection persistence, URL and empty/result state |
| Patient identity | Empty/invalid login; supplied account; signup validation and success; duplicate signup; wrong password; password visibility; recovery; logout/reload | Form errors, session behavior; no account enumeration |
| Patient appointments | Empty state; booking eligibility; slot/date selection; consent; submit; duplicate request; ownership; cancel; reschedule; stale slot | UI outcome and persisted booking; two patient accounts |
| Dentist public/onboarding | Landing CTAs; signup validation; duplicate account; login; profile details; qualifications; locations; fees; availability; verification submission; pending/rejected state | Saved state after reload; remains unpublished without genuine verification |
| Dentist workspace | Dashboard/empty appointments; filters; confirm/decline; reschedule; completion; notes; schedule collisions; logout | Role-scoped updates and patient view |
| Clinic onboarding | Landing/pricing/FAQ; signup steps; validation; account; clinic details; completion; login | Saved clinic and onboarding route |
| Clinic workspace | Dashboard, filters, manual booking; doctor add/edit/schedule; patients/detail/search; reviews/replies; settings/content/theme/services/hours; verification | Save/reload, validation, empty/error/success |
| Billing | Monthly pricing consistency; yearly disabled; checkout open/cancel/error; plan gates; expired state; paid subscription/webhooks/renewal/cancellation | Real payment steps require user action and receipts |
| Platform admin | Login; clinics/list/search/create/edit; verification review; revenue; analytics; moderation; leads/create/edit/discovery | Correct role, totals, validation, persistence |
| Permissions | Logged-out guards; patient cannot open dentist/clinic/admin; dentist cannot open clinic/admin; two clinic tenant separation; revoked session | Denial without data leakage; separate role accounts |
| Video | Public/private test entry; device check; permissions denied; consultation join; two parties; chat; prescription download; end/rejoin/expiry | Two real devices and authenticated booking for full pass |
| Notifications | Recovery/booking/confirmation/cancellation email receipt; failure state; outbox; WhatsApp handoff | Receipt, not just queued status; no unsolicited messages |
| Legal/help | Platform privacy/terms; clinic-specific privacy/terms; footer; contact/support targets | Correct scope and working navigation |
| Layout/accessibility | Desktop and 390px mobile at key flows; keyboard Tab/Enter/Escape; focus; labels; dialogs; no overflow; loading/empty/error/success | Screenshots and observed interaction |
| Operational acceptance | TLS/custom domains; production errors; monitoring; backup restore; deployment rollback | Read-only checks here; restore/rollback in isolated environment |

## Execution log

| ID | Case | Status | Observation |
| --- | --- | --- | --- |
| NAV-01 | Apex root | PASS | Root redirected to `/dentists`; marketplace rendered. Initial browser navigation timed out but page subsequently loaded. |
| DIR-01 | Empty production directory | PASS | Zero verified locations; opening-soon state and treatment guide; no deleted profiles displayed. |
| AUTH-01 | Supplied password with preserved admin | BLOCKED, resolved by user | UI returned Invalid email or password. User signed in successfully; do not classify an incorrect supplied password as an application defect. |
| ADM-01 | Admin clinics | PASS | Zero clinics, add-first-clinic CTA. |
| ADM-02 | Dentist verification | PASS (empty) | Empty pending queue; direct navigation restored authenticated session. Approval/rejection not exercised. |
| ADM-03 | Analytics | PASS (empty) | September 2026 and all-time totals zero, no recent bookings, all status counts zero. |
| ADM-04 | Revenue | PASS (empty/editor cancel) | MRR/ARR/profit zero, margin 0%, paying/free counts zero. Cost editor opens and cancels. Save not exercised. |
| ADM-05 | Review moderation | PASS (empty) | Pending reviews and open reports both zero. |
| ADM-06 | Lead pipeline filters | PASS (empty) | Search, Interested stage and Highest priority accepted; no records. |
| ADM-07 | Empty lead creation | PARTIAL | Clinic name/phone/city errors shown. Doctor Name has an asterisk but no corresponding required error; investigate validation contract. |
| ADM-08 | Empty clinic creation | PASS | Required clinic/doctor/phone/address/city errors; no record created. |
| ADM-09 | Clinic form billing and marketplace tabs | PASS (inspection) | Default Free/monthly, unlisted. Marketplace verification controls are staff-only. No fictitious verification applied. |
| DIR-02 | Keyword + Noida search | PASS (empty) | Query and locality chips, selected Noida, zero results and contextual guidance. |
| DIR-03 | Advanced filter dialog | PASS | Focus moves to Close filters; treatment, experience, gender, rating and fee apply as seven chips including keyword/location. |
| DIR-04 | Clear all | PASS | Keyword/location/fee reset; filter chips removed. |
| DIR-05 | Clinics/video/available today | PASS (empty) | Clinics discovery and video status visible; available-today independently toggles pressed state and chip. |
| DIR-06 | Fee sort | PASS (selection only) | Fee low-to-high persisted as selected value `fee`; ordering cannot be tested with zero results. |
| DIR-07 | Expand treatment guide | PASS | Four additional treatments appear, eight total. |
| DIR-08 | Sector 75 locality route | PARTIAL | Correct Sector 75 heading/results chip, but locality dropdown says Delhi NCR. |
| DIR-09 | Sector 75 breadcrumb | FAIL | `/dentists/noida/sector-75` breadcrumb points to `/dentists/sector-75`, which renders Clinic profile not found. Evidence: `artifacts/production-qa-2026-09-28/sector75-breadcrumb-error.png`. |
| MOBILE-01 | Marketplace 390×844 | PASS (inspected view) | No document horizontal overflow (385px client/scroll width); bottom patient nav visible; Professionals menu expands and navigates to dentist landing. |
| MOBILE-02 | Dentist landing 390×844 | ISSUE | Sign in wraps into two lines tightly against logo. Main heading/CTAs/cards fit. Evidence saved. |
| PRO-01 | Dentist landing → signup → login | PASS (navigation) | CTAs reach appropriate forms. |
| PRO-02 | Blank/malformed signup | PASS (rejection) | Form displays Enter your email and password; no account created. Complete registration pending user credential entry. |
| REC-01 | Recovery with admin session | PASS (inspection) | Shows Current password and Generate recovery code. Did not rotate the existing recovery credential. |
| BIZ-01 | Business landing pricing | PASS (disclosure) | Free, Basic ₹999/month, Pro ₹2499/month; monthly checkout messaging; AI explicitly unavailable. FAQ expands with same disclosure. |
| BIZ-02 | Business mobile menu | PASS | Open/close controls and menu destinations render; no document horizontal overflow. |
| BIZ-03 | Signup under admin session | PASS | Start Free routes existing admin to clinic administration. |
| HOST-01 | www canonicalization | PASS | www signup redirects to apex domain. |
| ROLE-01 | Admin accessing patient appointments | PASS | Business session active; asks for separate patient session. |
| ROLE-02 | Admin accessing dentist workspace | PASS | Redirects to dentist login, no dentist records exposed. |
| ROLE-03 | Admin accessing clinic workspace | PASS | Transient clinic login then routes to platform Clinics after session restoration; no clinic data exposed. |
| LEGAL-01 | Privacy/terms/support navigation | PASS (navigation), FAIL (identity copy) | Pages render and cross-link; describe mobile-number/booking-reference identity although current patients use email/password. |
| ADM-10 | Lead discovery | BLOCKED | Google Places API key not configured; UI displays setup instructions. |
| VIDEO-01 | Public video test without token | PASS (rejection) | Join test call shows invalid/expired invitation or unverified dentist; no room granted. |
| NAV-02 | Arbitrary nonexistent route | BLOCKED (harness) | Browser navigation rejected with ERR_BLOCKED_BY_CLIENT; not an application 404 verdict. |
| OPS-01 | Production availability | FAIL/needs investigation | Direct expired-plan route showed Render service-waking-up interstitial with multi-stage startup; capture saved. |
| OPS-02 | Cold-start recovery | RECOVERED | Both expired-plan and fresh directory navigations displayed Render startup. They later recovered automatically after repeated observations over approximately two minutes. This was not confined to one route. Repository render.yaml declares a free instance; live infrastructure configuration was not independently audited. |
| BILL-01 | Expired page without clinic | FAIL (UX), PASS (rejection) | Admin with no clinic sees Your clinic · Free account cancelled. Reactivate with Basic returns generic Bad Request; no checkout/payment completed. Pro repeats Priority support twice. |
| DIR-10 | Noida locality | PASS (route), FAIL (selection consistency) | Heading and results reflect Noida while Where are you? displays Delhi NCR. |
| DIR-11 | South Delhi/Cyber City breadcrumbs | FAIL | Both nested routes render; their breadcrumb destinations `/dentists/south-delhi` and `/dentists/cyber-city` render Clinic profile not found. Same defect as Sector 75. |
| DIR-12 | Remaining city and treatment links | PASS (route headings only) | Delhi, Gurugram, Ghaziabad, Faridabad; RCT Delhi; implants Delhi/Noida; braces Delhi/Noida; whitening Delhi; cleaning Delhi; emergency Delhi/Noida; Cyber City. Actual URLs/headings saved in directory-route-checks.json. Did not infer loaded API results from these route checks. |
| NAV-03 | Coming-soon | PASS (render) | Generic clinic opening-soon page renders, no fake opening date. |
| NAV-04 | Legacy admin/login | PASS | Ends at platform Clinics with existing admin session. |
| AUTO-01 | Production HTTP/API smoke | PASS | Six read-only checks passed: business shell, signup shell, Spring/PostgreSQL health, marketplace JSON, and expected 401 responses for unauthenticated user/admin APIs. |
| AUTO-02 | Playwright production smoke | PASS | All 15 read-only desktop/mobile route checks passed after correcting three test heading selectors. No unexpected console/page errors or horizontal overflow were found on the tested routes. |
| ADM-11 | Create unpublished QA clinic | PASS | Created inactive Free clinic `eddb76fc-d4ad-414e-9559-0884d08519a8`; directory shows Not listed and persisted the fictional contact, hours and QA service after reload. |
| E2E-01 | Expanded isolated Playwright lifecycle | IMPLEMENTED, CI pending | Added guest secure claim, patient reschedule/cancel, clinic confirm/complete, completed-visit review, platform moderation, clinic response, platform dentist approval and subscription-cancellation UI. It is restricted to loopback disposable PostgreSQL and never targets production. |

## Findings and blockers

- Admin access established through user sign-in. Clinic, dentist and patient role workflows still need their own accounts.
- Browser pointer actions did not activate some controls and coordinate input reported an out-of-viewport error. Keyboard Enter worked. Treat pointer reliability as a harness limitation, not a confirmed app defect.
- Revenue cost inputs and several clinic/lead form controls lack programmatic names in the accessibility tree; labels are visually separate generic text. Requires targeted accessibility remediation/recheck.
- P2: Sector 75, South Delhi and Cyber City breadcrumbs generate invalid locality paths. The selected locality dropdown also fails to represent route filters, including the ordinary Noida route.
- P1 content/trust: business landing still presents named customer testimonials as customer-provided feedback after user confirmed all clinic data is dummy. Hard-coded examples separately labelled Demo also remain. Database deletion never removed source content; do not claim the production pages contain no dummy content.
- P2: privacy and terms describe obsolete phone-based patient ownership. Align copy with email/password authentication and verified appointment linking.
- P1 operational: observed Render cold-start interstitial on a production route; investigate deployed hosting behavior before reliability acceptance.
- P2: Expired-plan page is reachable without a clinic, asserts a nonexistent subscription cancellation, and reactivation produces only Bad Request. Require clinic context or route to the appropriate workspace with an actionable message.

## Reproduction pointers

1. Open `/dentists/noida/sector-75`, activate Sector 75 breadcrumb: `/dentists/sector-75` becomes a profile lookup and returns not found. Template constructs `['/dentists', currentBreadcrumbCitySlug()]` in `src/app/features/marketplace/dentist-directory.component.html`.
2. Open `/dentists/noida`: compare Noida page heading/results with Delhi NCR selected in the locality field.
3. Open `/business`, scroll to Clinic owners love it: three named testimonials remain. Source is `src/app/features/business/platform-landing/platform-landing.component.ts` around lines 204–218 and customer-provided label in its HTML around line 980. User stated all clinic data is dummy; do not treat these claims as verified.
4. Open `/business/privacy` and `/business/terms`: phone/booking-reference identity wording conflicts with current patient email/password flow. Source: `platform-legal.component.ts` around lines 40/60.
5. In admin Revenue → Edit, inspect the four numeric fields: no programmatic accessible names in browser tree. Lead/clinic labels have similar gaps. Lead doctorName is also not required in the reactive form despite its asterisk (`lead-form.component.ts:28`).
6. Open `/business/clinic/expired` as platform admin with no clinic → Reactivate with Basic: generic Bad Request.

## Remaining execution gates

| Gate | Untested downstream cases | Next step |
| --- | --- | --- |
| Clinic owner workflow | Clinic owner login, doctors, scheduling, patients, notes, reviews, settings and plan gates | The inactive, unlisted QA clinic now exists. Continue with its clinic-owner account; keep the clinic unpublished and do not initiate paid checkout. |
| Separate dentist and patient identities | Successful signup, recovery-code continuation, profile/location saves, workspace, patient empty state, role isolation across users, duplicate signup | Create disposable accounts via UI with user completing new credential entry; save IDs and keep provider unverified. |
| Genuine provider listing | Public detail, published availability, request/confirm/decline/cancel/reschedule, ownership, reviews | No genuinely verified provider exists; do not mark a dummy clinician verified in production. Run these scenarios on isolated staging fixtures or onboard a genuinely verified provider. |
| Two tenant/patient accounts | Cross-tenant and cross-patient isolation, conflicting slots and stale session | Requires separate accounts and appointments; no claim from admin-only route checks. |
| Real email delivery | Recovery/booking/reminders received, failure/retry behavior | Controlled inbox and authorized messages; queue success is not delivery proof. |
| Live payments | Checkout, webhook activation, renewals, cancellation, failure, yearly rejection | User-controlled payment completion and a test clinic; monthly display alone is insufficient. |
| Media/devices | Camera/mic deny/allow, two-party video/audio, chat, downloads, reconnect/end, Safari/Android | Verified dentist/invitation and two real devices; public token rejection is only one negative case. |
| Infrastructure | Backup restore, rollback, custom tenant domains, monitoring, uptime, TLS details | Separate operational verification; do not restore/roll back production as a destructive QA step. |

Additional route cases not manually completed: hidden treatment-locality deep links not exposed in the footer, every legacy clinic page on a configured tenant domain, unknown-route browser rejection, logout/revocation and unauthenticated guards. No desktop/mobile blanket pass is implied: screenshots cover the inspected marketplace, dentist landing and selected admin/legal states only.
- Complete real booking/publication cannot be certified with no genuinely verified provider.
- iPhone Safari/Android hardware media, actual email delivery, live payment lifecycle, backup restore and rollback require separate evidence; never infer them from page rendering.

## Test data ledger

Created clinic `eddb76fc-d4ad-414e-9559-0884d08519a8`, named `QA 2026-09-28 - Unpublished Test Clinic`. It is inactive, Free, marketplace-unlisted, and does not accept new patients. It uses an explicit fictional doctor/address, reserved fictional phone +12025550123, and one service labelled `QA Test Consultation`. The clinic-owner email is the user-supplied test account; no password is stored in this report. Do not publish or clinically verify this fixture.
