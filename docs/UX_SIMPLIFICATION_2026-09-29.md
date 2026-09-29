# UX simplification — 2026-09-29

Scope: patient discovery, patient appointment entry, shared patient navigation, and clinic landing navigation. This is an incremental change to existing Angular journeys, not a complete redesign of authenticated workspaces.

## Observed friction and changes

1. **Patient discovery — improved and checked.** The original first screen exposed six treatment shortcuts, two provider types, a fee selector, more filters, sorting, and visit type around the search. Search is now the main task. Treatment shortcuts and the long locality/treatment link list use native expandable sections. Provider type and consultation fee are grouped in the existing filter dialog. Selected clinic mode remains visible as a removable chip and resets correctly. Video selection preserves location and treatment.
2. **Patient appointments — improved and checked.** The original signed-out view repeated its introduction above the login card, pushing the submit button below the first desktop viewport. Signed-out patients now start directly at the form. Signed-in patients retain their appointment controls and a concise contextual header. Email/password and secure guest-claim behavior are unchanged.
3. **Clinic entry — improved and checked.** The original header mixed sales sections, professional switching, signup, and login with another signup banner. The header now prioritizes Features, Pricing, FAQ, Start Free, and Sign in. Sign in remains directly available on mobile. The menu retains the dentist entry. Removed the duplicate signup banner and unsupported publication/response-time promises from the hero.

Shared navigation now says **Find a dentist** rather than Patients. Dentist and clinic links are grouped under **For professionals**. The mobile bar gives equal prominence to discovery and appointments, with only the active destination highlighted.

## Verification evidence

- Local preview runs against the existing disposable PostgreSQL fixture database; no production records were created or changed.
- Browser: desktop discovery, filter selection, provider-type chip removal, Escape dismissal and focus restoration to All filters, appointment entry, clinic sign-in navigation.
- Narrow viewports: 390px appointment entry and 320px discovery/clinic entry, no horizontal overflow measured; mobile professional and clinic menus open and navigate. Changing location then selecting video preserves the selected location.
- Focused directory/patient tests: 25 passed. Lint passed. Production build passed.
- Screenshots saved under `artifacts/ux-simplification/`: `01-discovery-before.png`, `02-appointments-before.png`, `03-clinic-before.png`, `04-discovery-after.png`, `05-appointments-after.png`, `06-appointments-mobile.png`, `07-clinic-after.png`. These are local review artifacts.

## Limits and next consolidation areas

The current pass does not redesign dentist profile editing, clinic scheduling/settings, or platform operations. These remain the next candidates for task-focused grouping. No claims of improved conversion or full accessibility compliance are made without user studies and assistive-technology testing. External payment/email/video acceptance and dependency-security work remain separate launch gates.
