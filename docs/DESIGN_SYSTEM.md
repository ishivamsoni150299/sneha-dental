# My Dental Platform UI System

The interface follows a **quiet clinical confidence** direction: warm-white
surfaces, precise ink typography, tenant-controlled colour, generous spacing,
and restrained motion. Patient pages should feel calm and human. Operational
screens should feel dense enough to work quickly without becoming visually
noisy.

The source of truth is `src/design-system.css`. It is loaded after Tailwind and
the legacy compatibility styles, so its semantic primitives win without
breaking older screens during migration.

## 1. Typography

- **Newsreader** is the clinic-facing display typeface. Use it for patient-page
  hero and section headings only.
- **Instrument Sans** is the interface typeface. Use it for navigation, forms,
  cards, dashboards, tables, and all body copy.
- Platform and admin headings intentionally stay in Instrument Sans because
  operational software needs a quieter hierarchy than the public website.

Use:

```html
<p class="ui-eyebrow">Services</p>
<h1 class="ui-display">Care that starts with listening.</h1>
<p class="ui-lede">Clear next steps, transparent costs, and a calm visit.</p>
```

Available roles:

- `ui-display` — one page-level marketing headline
- `ui-heading` — section and major panel headings
- `ui-heading-interface` — pair with `ui-heading` for the shared sans-serif account-screen heading
- `ui-title` — card and list-item headings
- `ui-lede` — introductory body copy
- `ui-body` — ordinary copy
- `ui-caption` — metadata and supporting labels
- `ui-eyebrow` — short section context; never use for a sentence
- `ui-link` — contextual text links

## 2. Colour architecture

Never choose a raw colour in an Angular template. Use a semantic token.

### Neutral tokens

| Purpose | CSS token | Tailwind token |
|---|---|---|
| Page canvas | `--ui-canvas` | `bg-ui-canvas` |
| Raised surface | `--ui-surface` | `bg-ui-surface` |
| Muted surface | `--ui-surface-muted` | `bg-ui-muted` |
| Primary text | `--ui-ink` | `text-ui-ink` |
| Supporting text | `--ui-ink-soft` | `text-ui-ink-soft` |
| Muted text | `--ui-ink-muted` | `text-ui-ink-muted` |
| Divider | `--ui-line` | `border-ui-line` |

### Tenant-aware tokens

`ClinicConfigService` owns the underlying `--accent*` values. The UI consumes
only these semantic aliases:

- `--ui-primary`
- `--ui-primary-hover`
- `--ui-primary-soft`
- `--ui-primary-line`
- `--ui-primary-shadow`

This lets the same component work for every clinic theme without colour-class
override hacks.

### Status tokens

Use success, warning, danger, and info only when communicating a real state.
Do not use green to decorate a card or red to attract attention.

## 3. Layout

```html
<section class="ui-section">
  <div class="ui-container">...</div>
</section>
```

- `ui-container` — application content width and responsive gutters
- `ui-container-reading` — narrow copy, confirmations, and focused CTAs
- `ui-section` — primary page section rhythm
- `ui-section-compact` — dashboards and secondary public sections
- `ui-grid-auto` — responsive repeated-card layout
- `ui-stack` — vertical content rhythm
- `ui-cluster` — wrapping horizontal action/metadata group

Account screens use `ui-auth-layout` for their outer grid and responsive spacing.
Add `ui-auth-layout-split` when a desktop supporting aside is present. Pair
`ui-card` with `ui-auth-card` for the common 28rem maximum form width and 1.5rem
content gap; use `ui-auth-footer` for separated secondary actions. These are
presentation patterns; authentication and role-specific routing stay in their
existing components and services.

Clinic onboarding pairs `ui-auth-layout` with `ui-onboarding-layout` while the
desktop preview is present. Its three-stage progress list uses `ui-steps` and
`ui-step`, `aria-current="step"` for the active stage, and
`ui-step-complete` with accessible completion text for completed stages.

Do not create a new `max-w-* + px-*` combination for each page. Use the
container primitives and add a grid only where the content requires it.

## 4. Surfaces

```html
<article class="ui-card">...</article>
<article class="ui-card ui-card-muted">...</article>
<a class="ui-card ui-card-interactive">...</a>
```

- `ui-card` — normal panel
- `ui-card-muted` — highlighted or contextual panel
- `ui-card-interactive` — clickable/hoverable card
- `ui-lens` — subtle clinical grid texture for a hero or one key panel
- `ui-divider` — semantic divider
- `ui-table-shell` + `ui-table` — desktop data tables
- `ui-empty-state` — no-result and first-use state
- `ui-skeleton` — loading placeholder

Avoid cards inside cards. An inner bordered surface is appropriate only for a
real repeated item, form grouping, or independently actionable region.

## 5. Actions

Every action starts with `ui-btn`.

```html
<button class="ui-btn ui-btn-primary">Save changes</button>
<a class="ui-btn ui-btn-secondary">View details</a>
<button class="ui-btn ui-btn-ghost ui-btn-sm">Cancel</button>
```

Variants:

- `ui-btn-primary` — one primary action per region
- `ui-btn-secondary` — supporting action
- `ui-btn-ghost` — low-emphasis navigation or dismissal
- `ui-btn-danger` — destructive action only
- `ui-btn-sm`, `ui-btn-lg` — size modifiers
- `ui-btn-icon` — square icon-only control; requires `aria-label`
- `ui-btn-block` — full-width mobile/form action

Buttons use a minimum 46px target. Never reproduce button padding, radius,
shadow, or hover behaviour with a local utility string.

## 6. Forms

```html
<label for="phone" class="ui-label">Phone</label>
<input id="phone" class="ui-field" aria-describedby="phone-help">
<p id="phone-help" class="ui-helper">10-digit mobile number</p>
```

Use:

- `ui-label`
- `ui-field`
- `ui-field-with-action` — reserves trailing space for an adjacent control, such as password visibility; pair with `ui-field`
- `ui-field-invalid`
- `ui-helper`
- `ui-error`

Requirements:

1. Every control has a visible label.
2. Validation text is connected with `aria-describedby`.
3. Invalid controls set `aria-invalid="true"`.
4. Placeholder text is an example, never the only label.
5. Form submission retains the primary button label and shows progress without
   moving the layout.

Legacy `form-input`, `form-label`, `ds-field`, and `ds-label` are compatibility
aliases. Do not use them in new templates.

## 7. Status and feedback

- `ui-badge` — neutral metadata
- `ui-badge-primary`
- `ui-badge-success`
- `ui-badge-warning`
- `ui-badge-danger`
- `ui-alert` with `ui-alert-success|warning|danger`
- `ui-status-dot` — compact live/open status inside a labeled badge

A colour or dot never communicates state by itself. Always include text.

## 8. Navigation boundaries

Clinic-facing routes use:

- `clinic-nav`
- `clinic-nav-link`
- `clinic-nav-link-active`
- `clinic-mobile-menu`
- `clinic-footer*`

Platform routes use:

- `platform-shell`
- `ui-topbar`
- `ui-nav-link`
- `ui-nav-link-active`
- `platform-mobile-nav`

Clinic-owner routes use `clinic-admin-shell`. Tenant accent is allowed there,
but marketing typography is not.

## 9. Motion

Motion explains state; it does not decorate empty space.

- Controls respond in 140–220ms.
- Panels may enter in up to 420ms.
- Hover movement is limited to 1–3px.
- Infinite animations are prohibited except a loading indicator or a real live
  state.
- `prefers-reduced-motion` is handled globally by the design system.

## 10. Accessibility baseline

- All interactive elements are keyboard reachable.
- Focus rings must remain visible; do not add `outline-none` without the shared
  focus treatment.
- Minimum touch target is 44×44px; shared controls use 46px.
- Body text must meet WCAG AA contrast.
- Icon-only buttons need an accessible name.
- Modal focus trapping and restoration must be tested whenever a modal changes.
- Public pages must be checked at 320px, 390px, 768px, and desktop widths.

## 11. Migration rules

When editing an existing screen:

1. Replace local page width/padding with `ui-container`.
2. Replace local headings with semantic typography roles.
3. Replace repeated button strings with `ui-btn` variants.
4. Replace inputs with `ui-field` and associated label/error roles.
5. Replace repeated white bordered boxes with `ui-card`.
6. Remove raw hex, arbitrary shadows, and route-specific radius choices.
7. Keep business logic and content unchanged during a visual migration.

New code must not introduce another naming family. `ds-*`, `form-*`, and old
route-specific classes remain only until their screens are migrated.

## 12. Review checklist

Before merging UI work, confirm:

- one clear primary action per region
- no raw colour values in templates
- no new arbitrary shadow/radius values
- empty, loading, error, success, and disabled states exist
- keyboard focus is visible
- mobile sticky actions do not cover content
- tenant themes preserve readable contrast
- `npm run lint`, `npm test`, and `npm run build` pass

## 13. Consolidation progress

### Shared authentication controls — 2026-09-27

The shared password form and account recovery now use `ui-field`, `ui-label`,
`ui-btn` variants, and `ui-alert` variants. The unused `auth-field` and
`auth-primary` definitions have been removed from `src/styles.css`. Password
visibility uses the shared ghost button and reserves input space through
`ui-field-with-action`. Authentication logic and role routing are unchanged.

Verification: ESLint, the production build, and all four existing
`PasswordLoginComponent` tests passed. Local Chrome checks of the compiled app
covered `/professional/login`, `/professional/signup`, `/business/login`,
`/appointments` (signed out), and `/account/recovery` (signed out) at 320, 390,
768, and 1440 pixels. Checked horizontal overflow, input/action sizes, password
visibility and keyboard focus where applicable. Reviewed mobile signup and
recovery screenshots and desktop clinic login. Signup mismatch validation and
login loading/disabled/error states passed using intercepted API responses.

This is presentation verification, not backend end-to-end evidence. Actual
signup, authenticated recovery, recovery-code success displays, platform staff
login, and clinic signup were not browser-verified in this pass. Their shared
form changes compile, but their complete journeys remain to be checked.
The surrounding auth page/card/link/icon styles and differing page layouts
remain for later consolidation; this pass does not certify every screen.

### Account layouts — subsequent consolidation, 2026-09-27

The page/card/link/icon follow-up above is now complete for dentist login and
signup, clinic/staff login, account recovery, and the patient account form.
They share card sizing, spacing, footer actions, and sans-serif account
headings. Dentist and clinic/staff login share the responsive split layout;
their role-specific content and navigation are preserved. The remaining
`auth-page`, `auth-card`, `auth-link`, and `auth-icon` styles were removed after
migrating every consumer. Decorative icon boxes and the nested signup-success
card were removed, leaving one clear form panel.

The production build, ESLint, and all 14 focused password-login, business-login,
and patient-appointments tests passed. Chrome presentation checks passed at
320, 390, 768, and 1440 pixels for the five routes above plus `/platform/login`
and `/business/signup`. Verified overflow, control sizing, password visibility,
keyboard focus, and the migrated cards' width, spacing, and heading font.
Reviewed desktop dentist login and mobile clinic login/recovery screenshots.
Additional mobile fixture checks and screenshots covered signup recovery-code
display, reset success, and authenticated recovery-code generation.

API responses were intercepted locally: these checks do not prove real account
creation, reset authorization, or production delivery. Clinic signup's full
multi-step layout and the authenticated appointments workspace remain outside
this layout migration. The existing `platform-auth-*` compatibility rules are
still used by those older business templates and have not been removed.

### Clinic onboarding shell and progress — 2026-09-27

Clinic signup now uses the shared page shell, top bar, account card, interface
headings, and primary/secondary actions. Its progress indicator is an ordered
three-stage list with an accessible current/completed state. Clinic-hours rows
wrap on narrow screens and use labeled shared time inputs and toggle buttons.
The preview column is removed from the success layout rather than leaving an
empty sidebar. Failed creation now displays the component's existing error
message in a shared alert, allowing the user to understand and retry a failure.

Production build, ESLint, and eight existing signup/password-login tests passed.
Local Chrome checks covered account, clinic, services, plan, and success states
at 320, 390, 768, and 1440 pixels without horizontal document overflow. Checked
next/back navigation, edited hours surviving back navigation, the active step,
disabled yearly billing, a monthly submission payload, and creation
loading/error/retry/success with intercepted API fixtures. Reviewed mobile
clinic/services and desktop plan screenshots.

Actual provisioning, Google Places, payment checkout, and live delivery were
not exercised. Theme/service/plan option styling, the website preview, and the
success celebration remain existing implementations for a later pass; the
entire onboarding UI is not yet fully migrated. `platform-auth-*` styles remain
for the legacy password-recovery templates, not for clinic signup.
