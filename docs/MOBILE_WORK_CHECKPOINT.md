# Clinic mobile dashboard checkpoint

User reported an overcrowded signed-in mobile clinic dashboard with excessive
spacing, large counters, nested card padding and a clipped search hint.

This batch removes duplicate queue padding, replaces tall mobile count cards
with a compact view selector, reduces heading and empty-state spacing, and
shortens the visible search hint while retaining a descriptive accessible label.
Pending keeps the accessible name “Needs confirmation”. Touch controls remain
at least 44 pixels high. Desktop view cards remain available.

Validated with lint, production build, and
`CHROME_BIN=/path/to/chromium node scripts/clinic-mobile-ui-smoke.mjs`.
The browser check uses synthetic authenticated clinic responses with a long
clinic name and tests empty/populated dashboards at 320, 390, 768 and 1440 pixels.
It checks content placement, view switching, filters, enquiries and overflow.
It does not certify real authentication or database writes; CI covers those.

The dashboard batch was deployed as `d480321`; both CI jobs and production
smoke checks passed.

## All-page mobile pass — 10 November 2026

User requested the same cleanup across all UI pages. This pass updates shared
workspace spacing, clinic patients/settings/reviews, patient appointment cards,
dentist appointment filters, platform navigation and clinic search, and dentist
directory result spacing. Patient statistics are now an expandable summary.
Platform mobile navigation has three primary destinations and a native “More”
dialog containing requests, reviews, analytics, revenue and account recovery.
The dialog retains keyboard focus and restores focus when dismissed.

Verification uses the existing isolated PostgreSQL/Spring/Angular browser suite
with `E2E_UX_AUDIT=1`: 72 configured routes across four widths (288 checks).
Optional `E2E_UX_SCREENSHOTS=1` saves 390-pixel screenshots for visual review.
Additional signed-in patient, clinic, dentist and platform screenshots are kept
outside the repository with the test evidence. The public account and booking
screens retain their existing working layouts; a route check does not certify
every possible data or integration state.

Local result: all 288 route-and-viewport checks passed, alongside authenticated
booking, patient, clinic, review and dentist journeys. Lint, the production build
and compiled-asset checks passed. Final signed-in screenshots were reviewed for
patient cards, clinic patients/settings/reviews, dentist appointments/hours,
platform clinics/leads/reviews and the More menu.

Next: push the verified changes and check CI and production rollout. Keep
pushing tested batches. If interrupted, resume from the working tree and this
checkpoint.
