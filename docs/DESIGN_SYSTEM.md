# My Dental Platform Design System

This project uses a token-first UI system so clinic websites can be rebranded without rewriting page templates.

## Token Model

Design values live in `src/styles.css` as CSS variables and are exposed to Tailwind in `tailwind.config.cjs`.

Use semantic Tailwind colors in new templates:

- `bg-app-bg`, `bg-app-elevated`, `bg-app-muted`
- `text-app-text`, `text-app-text-soft`, `text-app-text-muted`
- `border-app-line`, `border-app-line-strong`
- `bg-brand`, `text-brand`, `border-brand-border`, `bg-brand-soft`
- `text-status-success`, `bg-status-success-soft`, `text-status-warning`, `text-status-danger`

Do not put raw hex values in templates. If a new color is needed, add it as a token first.

## Component Classes

Prefer the shared design-system classes before writing a long utility string:

- `ds-container` for page width and horizontal padding
- `ds-section` and `ds-section-tight` for vertical rhythm
- `ds-card` and `ds-card-muted` for repeated panels
- `ds-kicker`, `ds-heading`, `ds-title`, `ds-copy`, `ds-small` for typography
- `ds-button`, `ds-button-primary`, `ds-button-secondary`, `ds-button-whatsapp` for actions
- `ds-field`, `ds-label`, `ds-helper`, `ds-error` for forms
- `ds-icon-tile` for service and feature icons

Legacy `ui-*` and `form-*` classes are still supported because business and setup screens already depend on them. New patient-facing work should use `ds-*`.

## Route Boundaries

Patient-facing clinic pages render under `ClinicLayoutComponent` and must remain inside `.clinic-theme-scope`. Clinic theme overrides are intentionally scoped there so public clinic branding does not leak into the SaaS business console.

Business/admin routes under `/business` should use neutral app tokens and must not depend on clinic override classes such as `theme-emerald .bg-blue-600`.

## Layout Standards

- Use `ds-container` for every top-level section.
- Keep one primary CTA per page: "Book Appointment".
- Keep mobile CTAs thumb-friendly with minimum 44px height.
- Avoid decorative color overload. Status colors are only for real states.
- Keep card content scannable: title, short copy, action.
- Do not create nested card layouts unless the inner card is a real repeated item or modal surface.

## Mobile Standards

- Test every public page at 390px width before release.
- Text must not overflow buttons, tabs, or cards.
- Sticky bottom booking actions must not cover form submit buttons.
- Floating WhatsApp action stays bottom-right and must clear the mobile bottom bar.

## Figma Handoff

Figma screens should represent the implemented application, not an independent fantasy design. When screens are refreshed, capture these routes:

- `/`
- `/services`
- `/appointment`
- `/contact`
- `/business`

The implemented token names in this document are the source of truth for future Figma variable naming.
