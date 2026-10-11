# Simple daily journeys

Direction agreed on 10 October 2026: make the frequent tasks for patients,
dentists and clinics easy to understand and aim for completion within 20 seconds.
This is a usability target, not a promise about network speed, authentication,
clinical decisions, onboarding, verification or payment processing.

## Rules for every role

- Show the frequent task first. Keep one clear next action per appointment.
- Put time, person, location and fee before supplementary information.
- Update search results as the user types; do not require a redundant submit.
- Keep optional information expandable, with clear labels and keyboard access.
- Preserve entered values when changing time or retrying a failed request.
- Distinguish a failed request from an empty result or an unavailable time.
- Keep consent, patient ownership, role checks and confirmations for cancellation.
- Use the shared design tokens and controls. Avoid a second navigation layer.

## Implemented journeys

| User | Frequent task | Current path |
| --- | --- | --- |
| Patient | Request an appointment | Choose a listed time → enter name/mobile → consent and send; mobile verification when required |
| Patient | Change a visit | My appointments → Change time → choose date/time → Save request |
| Patient | Review a request | Short receipt → My appointments; guest requests still require verified ownership to link |
| Dentist | Confirm or check in | Appointments → the patient card's next action |
| Dentist | Find a patient | Type name, phone or reference directly in the appointments screen |
| Dentist | Review requests | Needs confirmation is a visible button, without opening a select menu |
| Clinic | Confirm, check in or complete | Find the patient → Confirm, Arrived or Done; other actions remain in Details |
| Clinic | Find a patient | Search is always visible; optional date filters are expandable |
| All accounts | Sign in | Email/password → existing role-specific destination; no role selection on sign-in |

The directory shows times on the first bookable day, rather than forcing a
profile visit or hiding future times when today is full. Today-only filtering
still uses the actual India calendar day. Time links carry their doctor and
instant through availability validation into the short request form.
Credentials, verification evidence, ratings and full profiles remain accessible.
Treatment guides and promotional information are grouped below results.

Booking network errors now offer retries. A failed doctor request cannot expose
times which the form rejects because its doctor list is empty. Failure to check
a linked time leaves the time picker usable. A failed form availability check
offers Retry this time rather than claiming that the slot has disappeared.
Successful requests move keyboard focus to the receipt heading.

## Evidence and remaining work

Chrome fixture checks cover 320, 390, 768 and 1440px: direct directory time links,
booking submission, retained details while changing time, receipt focus,
patient rescheduling entry, staff search and check-in, filter Escape/return
focus, browser errors and horizontal overflow. Staff status updates are
intercepted; booking uses the local preview fixture. These are frontend
interaction checks, not live backend or authorization acceptance.

The full Angular suite passed 258 tests during implementation. Final template
polish is additionally checked with the affected directory, booking and clinic
dashboard suites. Lint and the production build are required before handoff.

Remaining acceptance: timed tests with actual patients, dentists and clinic
staff; physical iPhone/Android with the keyboard open; slow and failing real
networks; isolated database journeys and actual notification/media delivery.
Measure completion time, wrong turns, backtracking and abandoned forms. Do not
infer a 20-second human completion time from an automated browser run.

This pass covers the common daily flows and shared sign-in. Clinic onboarding,
payment, advanced settings, verification review and platform administration
retain their current workflows and need separate simplification and timing
passes. Required information cannot be removed merely to meet the time target.
