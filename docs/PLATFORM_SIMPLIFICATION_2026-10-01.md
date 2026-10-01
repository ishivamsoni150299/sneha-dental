# Shared platform navigation and authentication

The public home remains `/dentists`. `/workspace` now restores the session and opens the appropriate patient, dentist, clinic, or platform workspace. Existing destination guards and legacy URLs remain in place. Signed-out visitors use `/account`.

Authentication guards and clinic sign-out now link directly to the shared account route. The redundant professional login method was removed. Account recovery shares the platform layout, waits for session restoration, and is the destination of legacy business recovery URLs.

Mobile navigation has three accessible destinations: discovery, appointments/workspace, and sign-in/security. Staff no longer see patient appointments in the desktop platform navigation. Mobile account forms have smaller padding and avoid a duplicate header sign-in action on the account page.

Validation:

- 192 frontend tests passed, including role routing and unsafe return destinations.
- Lint, production build, and compiled artifact checks passed.
- 210 browser route/viewport checks passed against isolated Spring/PostgreSQL, plus booking, signup, recovery-code handoff, clinic management, and dentist workflows.
- Account/recovery pages passed 16 viewport/accessibility checks at 320, 390, 768, and 1440 pixels. Narrow screenshots were inspected.
- Keyboard navigation to recovery, invalid-reset feedback, and the mobile discovery tab passed.

Role-specific workspace internals remain separate permission boundaries. External payment, email delivery, and video media integrations were not changed or re-certified by this work.
