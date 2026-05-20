# Real Clinic Readiness Checklist

The application can be made production-ready, but no web app should be called safe for a real clinic until the deployment, data, integrations, and clinic operations are verified together.

## Code Readiness Now

- Angular routes are lazy-loaded and separated between patient-facing pages and business/admin pages.
- Patient-facing theme overrides are scoped through `.clinic-theme-scope` to avoid theme leakage into the business console.
- A semantic design-system layer exists in `tailwind.config.cjs` and `src/styles.css`.
- Shared patient-facing cards and section headers use design-system primitives instead of one-off visual recipes.
- Voice-to-action booking support exists through the AI receptionist webhook/tool flow.

## Must Verify Before Go-Live

- Production domain, DNS, SSL, redirects, and canonical URLs.
- Firebase/Firestore security rules for tenant isolation.
- Required Firestore indexes for appointment, lead, and clinic queries.
- Appointment booking end to end: form validation, duplicate prevention, storage, confirmation, and clinic notification.
- AI receptionist environment variables, ElevenLabs tool registration, phone number routing, and fallback behavior.
- WhatsApp, phone, email, address, business hours, map links, and emergency instructions.
- Real clinic copy, real service pricing policy, real doctor profile, and real clinic photos.
- Privacy policy, consent language, data retention, and local legal requirements.
- Error monitoring, analytics, backup/export process, and owner access recovery.
- Mobile acceptance on Chrome Android and Safari iPhone.
- Manual smoke test for `/`, `/services`, `/appointment`, `/contact`, and `/business`.

## Release Gate

Do not connect a real clinic's main phone line or publish paid ads until these checks pass:

1. A test patient can book from mobile without staff help.
2. The clinic receives the appointment details in the expected place.
3. Staff can call back from the saved lead or appointment record.
4. The AI receptionist creates the same usable booking action as the web form.
5. A failed AI action gives a clear fallback instead of losing the patient.
6. Admin data for one clinic cannot be seen from another clinic account.
7. The clinic owner has confirmed all public content and contact details.

## Future Scalability Rules

- Add new clinics through configuration and tokens, not copied pages.
- Keep tenant-specific branding inside clinic config and theme variables.
- Keep shared UI in `src/app/shared/components` and business logic in `src/app/core`.
- Add tests around appointment, lead, and tenant data flows before increasing clinic count.
- Treat every new integration as a release gate item with fallback behavior.
