# Video consultations

Video appointments use the existing working-hours schedule, slot reservation and confirmation workflow. Patients cannot book arbitrary times outside published availability. Rooms open 10 minutes before a confirmed appointment and close 60 minutes after its scheduled start (IST).

## Independent deployment

LiveKit Cloud is also supported with the same four environment variables and the native consultation UI. Follow the [free Build plan setup](../deploy/video/LIVEKIT-CLOUD.md). Cloud mode revokes patient and dentist tokens before room deletion; self-hosted deployments instead require the server room policy below.

Set `VIDEO_PROVIDER=livekit` to run calls through your own LiveKit server. No managed video account is used in that mode. See [the server deployment guide](../deploy/video/README.md) and [backend environment template](../deploy/video/backend.env.example). It requires a public VPS, trusted TLS and TURN connectivity. Deployment and a two-device media check are required before claiming production readiness.

The default remains `daily` for existing deployments. Daily Prebuilt remains supported with `DAILY_API_KEY` during migration; it is never used as an automatic fallback in self-hosted mode.

## Simple call flow

1. A verified dentist publishes working hours. A patient selects an available video slot, signs in or creates a patient account on the same booking page, and submits their details. The clinic/dentist confirms the request. Independent profiles show the video time picker directly without an in-clinic mode choice.
2. The patient opens **My appointments**. The assigned dentist or authorized clinic administrator opens the appointment in their workspace. Select the video-call button during the join window.
3. Select **Join call**. The native room requests camera and microphone access and connects in one action. A failed camera does not prevent using an available microphone. **Camera & microphone options** contains an optional preview, device selection, microphone meter and an option to join with both devices off.
4. The other person appears when they join. Microphone, camera, chat and leave controls stay within reach on mobile. A disabled or unavailable device can be enabled individually using its call control, without reopening the room.
5. Reconnecting and weak-network messages explain connection state. If browser audio autoplay is blocked, **Tap to hear the call** enables it. Leaving, navigating away, closing the dialog or pressing Escape stops media.

Chat and written prescription sharing are available in appointment rooms for both LiveKit and Daily. The native test room also includes chat. On desktop, chat opens beside the video; on mobile it opens above the persistent call controls. The dentist/clinic can select **Share as prescription** and enter medicine, dosage, duration and instructions. The patient can save the message as a `.txt` file before leaving. This is text sharing, not a signed e-prescription workflow or PDF/image attachment upload.

Chat is available only while both participants are present. Messages remain in browser memory for the current room and are not stored in patient records or replayed to late joiners. Failed sends preserve the draft. Reliable LiveKit data packets / Daily app messages carry bounded plain text; the UI validates incoming messages and only accepts prescription messages from the provider's dentist/owner identity. Sending is not a read receipt. No recording, transcription, screen sharing or automatic payment collection is enabled. Fees are settled through the existing clinic workflow.

## Private equipment test

A verified dentist can open `/professional/video-test`, select **Start test call** and share the temporary invitation with one second device. The guest does not need an account. This does not create an appointment or expose unscheduled slots. Invitations expire after 30–60 minutes and recheck the dentist's verified/enabled state. Refreshing access keeps the same test room, even across a half-hour boundary.

## Access and lifecycle

- Patient account calls require ownership of the appointment. Clinic and dentist calls require their existing authenticated access checks. The legacy appointment endpoint also requires an authenticated matching patient identity; a booking reference and unverified phone number alone do not authorize a call.
- Pending, cancelled, declined, completed, expired and in-person appointments cannot mint video tokens. Rescheduling creates a new room after confirmation.
- Java returns credentials with `Cache-Control: no-store`. Room identities are opaque, display identities are `patient` / `dentist`, and tokens stay in browser memory. Chat and prescription content is transported through the selected video provider; it is not logged or persisted by this application.
- Self-hosted join tokens last at most two minutes. The call screen refreshes access after device setup, immediately before connecting. Participants cannot create rooms, record, change metadata or publish media besides camera/microphone tracks. Room-scoped data publishing is enabled for consultation chat; deploy the backend grant change alongside the frontend.
- The media server must enforce `room.auto_create: false` and a two-person limit. The backend creates the room explicitly, and V21 stores durable room leases. A cleanup worker deletes expired, cancelled, completed or rescheduled rooms, and test rooms whose dentist is no longer eligible. Failed deletions are retried. The worker runs every 15 seconds while the Java service is running.
- The appointment browser also revalidates access every 15 seconds and closes on failure. Native rooms stop at their scheduled expiry. No system can promise immediate remote disconnect while the API/media control plane is unavailable; monitor cleanup failures and keep the API running continuously.
- `GET /api/public/video-consultations/status` reports configuration readiness. Creating a room additionally checks control-plane connectivity. Neither proves audio/video or TURN delivery; that needs a live media test.

## Release verification

The disposable PostgreSQL browser CI journey covers independent-dentist verification, published slots, patient sign-in without leaving the booking page, submission through the video booking form, dentist inbox/confirmation and patient-account visibility. Its video configuration is a non-routable fixture for booking checks and does not prove media delivery. The LiveKit smoke test below is required separately.

For LiveKit, set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in the local process environment and run `npm run test:video:media`. This creates a temporary two-person room, connects two isolated Chrome contexts, verifies that each receives video frames and an audio signal, and deletes the room. Set `CHROME_BIN` when Chrome is outside the default Windows path; on other systems install Playwright's Chromium. This checks the media provider, while the appointment and login flow still requires the application tests below.

Run the Angular video tests and backend video/access tests. On the deployed media server, test two browsers/devices, microphone and camera both ways, permission denial, mute, leaving during device prompts, expired invitations, reconnection, unauthorized access, cancellation and rescheduling. Verify chat in both directions, unread counts, failed-send retry and saving a prescription. Check 320px mobile, Android Chrome, iPhone Safari (including the keyboard), tablet, laptop and desktop in portrait and landscape. Repeat using mobile data and forced TURN/TLS. Confirm cleanup survives a backend restart.

References: [LiveKit deployment](https://docs.livekit.io/transport/self-hosting/vm/), [access grants](https://docs.livekit.io/frontends/reference/tokens-grants/), [JavaScript SDK](https://docs.livekit.io/reference/client-sdk-js/).
