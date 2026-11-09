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

Next: verify CI and deployment for this batch. Keep pushing tested batches.
If interrupted, resume from the working tree and this checkpoint.
