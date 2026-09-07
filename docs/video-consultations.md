# Video consultations

Video appointments use Daily Prebuilt with private, appointment-specific rooms. Existing appointments remain `in_person`; the database migration adds `consultation_mode` with a default and a constraint. Video and in-person bookings share the existing atomic doctor-slot reservation, so they cannot occupy the same slot twice.

## Enable production

1. In the Daily dashboard, create or select the account/domain used for this platform and obtain its server API key. Review the account's terms and data-processing settings for your practice before accepting real consultations.
2. Set `DAILY_API_KEY` as a secret environment variable on the Render backend service, then redeploy. Never put this key in Angular environment files, Git, chat, or the browser. No Daily domain or browser API key is required.
3. Sign in as a clinic administrator. Open **Clinic Settings → Services → Video consultations**, set the fee, enable requests, and save. A clinic also needs marketplace verification, accepting-new-patients status, and an available verified dentist with a schedule.
4. Book a **Video consultation** from the dentist directory or profile. Confirm it in the clinic dashboard. The patient uses **My appointments**, their booking reference, and booking phone number to open the call; clinic staff opens the appointment details and selects **Start video consultation**.

Readiness check: `GET /api/public/video-consultations/status` reports whether a server API key is configured. This is configuration readiness, not a provider connectivity or billing check. If the key is invalid or Daily is unreachable, joining fails with a recoverable error. New video bookings are rejected when the key is absent. In-clinic bookings continue to work.

## Access and lifecycle

- Rooms open 10 minutes before the scheduled appointment and expire 60 minutes after it, using Asia/Kolkata time. The appointment itself uses the existing 30-minute slot schedule; the extra room time allows for delays.
- Only confirmed or checked-in video appointments can obtain tokens. Pending, cancelled, declined, completed, expired, and in-person appointments are denied.
- Patient joining requires both the booking reference and phone number, matching the platform's existing guest-booking access model. This is not an OTP identity check. Staff access additionally requires a valid clinic-admin JWT for that appointment's clinic.
- Tokens expire for joining after two minutes and are scoped to one room. Existing participants are not removed at token expiry; the room has a separate end time. The browser checks appointment access every 15 seconds and closes media when access is denied or cannot be revalidated. This browser check is not provider-side immediate token revocation; already issued tokens can be used until their short expiry.
- A rescheduled appointment returns to pending and uses a different room for the new date/time. Rejoining creates a fresh token; joining does not mark treatment complete. Staff records completion through the existing dashboard workflow.
- No patient name, phone, booking reference, or treatment is sent to Daily. Display names are “Patient” and “Dentist”; room names use an opaque appointment identifier and scheduled time. Tokens stay in memory, are returned with `Cache-Control: no-store`, and are not put into URLs or application logs.
- The integration does not request recording or transcription, and hides recording controls. It does not implement payment collection; clinics settle consultation fees directly.
- Daily supplies camera/microphone selection, prejoin checks, audio/video controls, reconnection UI, and a leave button. The app destroys the call instance on close, Escape, navigation, or component destruction.

## Verification before accepting patients

Use a dedicated test clinic and two separate browsers/devices with an appointment near the current time. Confirm successful patient/staff joining, audio/video both ways, device permission denial, reconnect, leaving, cancellation, rescheduling, and the end-of-room window. A valid Daily key is required for this final live-media test; mocked provider tests cannot prove network/media delivery.

Implementation references: [Daily private rooms](https://docs.daily.co/reference/rest-api/rooms/create-room), [meeting tokens](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token), [Daily Prebuilt](https://docs.daily.co/reference/daily-js/factory-methods/create-frame).
