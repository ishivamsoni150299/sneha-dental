# Clinic dashboard simplification

Appointments were below an expanded eight-step setup checklist, statistics, revenue cards, and promotional banners. The first desktop screen did not show the appointment list.

The list now follows a collapsed setup checklist. Existing overview, website, and subscription information remains available below the list in expandable sections. Search and export labels are explicit; search/date fields have accessible names, the filter disclosure exposes its expanded state, and status buttons expose their selection. Section buttons wrap on narrow screens.

Validation: production build, ESLint, and four existing dashboard tests passed. In the local disposable clinic, checked desktop and 320px mobile layouts, search with no results, clearing search, completed-status filtering, and Enter-key expansion/collapse of setup. Screenshots are in artifacts/clinic-ux (untracked): 01-before.png, 02-after.png, 03-mobile.png.

This is a template-only change. Appointment writes, payments, notifications, other roles, and production deployment were not retested in this pass. The preceding commit 2145312 passed GitHub CI; deployment of this follow-up has not been verified.

## Settings follow-up — 2026-09-30

Collapsed the settings setup checklist, made its navigation items real keyboard-accessible buttons, and wrapped section navigation rather than requiring horizontal scrolling. Added selected-state semantics, a named back link, and plain-language profile guidance. Appointment cancellation now says Cancel/Keep appointment instead of Remove/Keep; the details close button has an accessible name.

Production build, lint, and all four dashboard regression tests passed. Settings visual and keyboard verification remains pending: the local preview returned to sign-in and the test session could not be restored through browser automation. No production data or appointment state was changed.
