# Screen and flow coverage — 18 October 2026

Scope: all 39 routed screen components across 85 route entries, including aliases and redirects. Inventory command: `node scripts/screen-inventory.mjs`. This is source-review coverage, not proof that every screen or state has passed a live visual check.

## Shared improvements

- Mobile form controls use readable text; shared buttons have 44px minimum height and wrap long labels.
- Submitted forms focus the first visible, enabled invalid field; valid and removed forms leave focus alone.
- Existing route guards, role boundaries, booking APIs and navigation destinations remain intact.

## Flow changes

- Patient appointments, clinic patient records, clinic reviews, dentist appointments and platform moderation distinguish failed loads from empty results.
- Patient-record retries reset stale errors; next visits use the clinic date and chronological time order.
- Account recovery explains incomplete submissions, exposes password requirements and presents a direct sign-in action after success.
- Clinic review publishing validates trimmed replies, prevents overlapping edits and preserves the draft after failure.
- Lead editing keeps footer actions in document flow to avoid fixed mobile navigation and removes automatic keyboard activation.
- Clinic and lead form failures are announced; the profile report prompt now accurately names patient sign-in.

## Route coverage

Every component below was included in the navigation/state source scan. Shared improvements apply where those primitives/forms are used; rows without a specific change are not claims of a redesign. All rows still need signed-in browser visual verification on mobile and desktop.

| Screen component | Route(s) |
| --- | --- |
| mili-page | `/mili` |
| dentist-directory | `/book`, `/dentists`, `/dentists/noida`, `/dentists/delhi`, `/dentists/gurugram`, `/dentists/ghaziabad`, `/dentists/faridabad`, `/dentists/noida/sector-75`, `/dentists/root-canal/noida`, `/dentists/dental-implants/delhi`, `/dentists/braces/delhi`, `/dentists/root-canal/delhi`, `/dentists/root-canal/gurugram`, `/dentists/dental-implants/noida`, `/dentists/dental-implants/gurugram`, `/dentists/braces/noida`, `/dentists/teeth-whitening/delhi`, `/dentists/teeth-whitening/noida`, `/dentists/cleaning-scaling/delhi`, `/dentists/cleaning-scaling/noida`, `/dentists/emergency/delhi`, `/dentists/emergency/noida`, `/dentists/delhi/south-delhi`, `/dentists/gurugram/cyber-city` |
| login | `/account` |
| account-recovery | `/account/recovery` |
| video-test | `/video-test`, `/professional/video-test` |
| professional-entry | `/professional`, `/business` |
| professional-profile | `/professional/profile` |
| professional-workspace | `/professional/workspace` |
| marketplace-booking | `/dentists/:slug/book` |
| dentist-profile | `/dentists/:slug`, `/dentist/:slug`, `/clinic/:slug` |
| patient-appointments | `/appointments` |
| home | `/` |
| services | `/services` |
| about | `/about` |
| appointment | `/appointment` |
| confirmed | `/appointment/confirmed` |
| gallery | `/gallery` |
| testimonials | `/testimonials` |
| contact | `/contact` |
| legal | `/privacy`, `/terms` |
| signup | `/business/signup` |
| platform-legal | `/business/privacy`, `/business/terms` |
| admin-expired | `/business/clinic/expired` |
| admin-dashboard | `/business/clinic/dashboard` |
| admin-settings | `/business/clinic/settings` |
| admin-patients | `/business/clinic/patients` |
| admin-reviews | `/business/clinic/reviews` |
| clinic-list | `/business/clinics` |
| clinic-form | `/business/clinics/new`, `/business/clinics/:id/edit` |
| dentist-verification | `/business/dentists/verification` |
| revenue | `/business/revenue` |
| analytics | `/business/analytics` |
| patient-requests | `/business/patient-requests` |
| review-moderation | `/business/reviews` |
| lead-list | `/business/leads` |
| lead-discover | `/business/leads/discover` |
| lead-form | `/business/leads/new`, `/business/leads/:id/edit` |
| coming-soon | `/coming-soon` |
| not-found | `/**` |

## Embedded and tabbed surfaces

These belong to routed screens and must be included in the follow-up runtime pass:

- Mili persistent panel, dentist search, booking and clinic setup tasks.
- Clinic dashboard: appointment list, enquiry list, appointment drawer, cancellation and rescheduling.
- Clinic settings: profile, contact, hours, doctors, services, testimonials, social links, theme, logo and subscription.
- Dentist workspace: appointments, availability and profile; practice/location editing.
- Account: sign-in, sign-up and recovery; clinic onboarding steps.
- Patient appointments: cancellation, rescheduling, review submission and video entry.
- Platform administration: verification decisions, review/report moderation, lead discovery and edit forms.

## Verification limits

Unit tests, lint, production build and artifact checks validate code and selected regression scenarios. They do not validate touch ergonomics, keyboard overlays, all tenant configurations, payment completion, voice operations or the deployed Render release. No connected browser was available for a signed-in visual pass in this session.

Next visual pass: representative public, patient, dentist, clinic and platform sessions at 320px, 390px, 768px and desktop; include loading, failure/retry, empty, success, keyboard and modal states. Record failures against this inventory rather than treating a successful build as launch certification.
