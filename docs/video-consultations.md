# Video consultations

Video appointments use the existing working-hours schedule, slot reservation and confirmation workflow. Patients cannot book arbitrary times outside published availability. Rooms open 10 minutes before a confirmed appointment and close 60 minutes after its scheduled start (IST).

## Independent deployment

Set `VIDEO_PROVIDER=livekit` to run calls through your own LiveKit server. No managed video account is used in that mode. See [the server deployment guide](../deploy/video/README.md) and [backend environment template](../deploy/video/backend.env.example). It requires a public VPS, trusted TLS and TURN connectivity. Deployment and a two-device media check are required before claiming production readiness.

The default remains `daily` for existing deployments. Daily Prebuilt remains supported with `DAILY_API_KEY` during migration; it is never used as an automatic fallback in self-hosted mode.

## Simple call flow

1. A verified dentist publishes working hours. A patient signs in, selects an available video slot and books. The clinic/dentist confirms the request.
2. The patient opens **My appointments**. The assigned dentist or authorized clinic administrator opens the appointment in their workspace. Select the video-call button during the join window.
3. With self-hosted video, select **Check camera & microphone**. Preview your camera, select devices and check the microphone meter. A failed camera does not prevent using an available microphone.
4. Select **Join call**. You can join to listen without giving camera/microphone permissions, then use **Enable devices**. The other person appears when they join. Microphone, camera and leave controls stay within reach on mobile.
5. Reconnecting and weak-network messages explain connection state. If browser audio autoplay is blocked, **Tap to hear the call** enables it. Leaving, navigating away, closing the dialog or pressing Escape stops media.

No recording, transcription, chat, screen sharing or automatic payment collection is enabled. Fees are settled through the existing clinic workflow. This implementation is a two-person consultation, not a claim of full feature parity with another platform.

## Private equipment test

A verified dentist can open `/professional/video-test`, select **Start test call** and share the temporary invitation with one second device. The guest does not need an account. This does not create an appointment or expose unscheduled slots. Invitations expire after 30–60 minutes and recheck the dentist's verified/enabled state. Refreshing access keeps the same test room, even across a half-hour boundary.

## Access and lifecycle

- Patient account calls require ownership of the appointment. Clinic and dentist calls require their existing authenticated access checks. The earlier guest appointment endpoint retains its booking-reference/phone checks.
- Pending, cancelled, declined, completed, expired and in-person appointments cannot mint video tokens. Rescheduling creates a new room after confirmation.
- Java returns credentials with `Cache-Control: no-store`. Room identities are opaque, display identities are `patient` / `dentist`, and tokens stay in browser memory. No names, phone numbers or treatment details are sent to the media server.
- Self-hosted join tokens last at most two minutes. The call screen refreshes access after device setup, immediately before connecting. Participants cannot create rooms, record, change metadata or publish anything besides camera/microphone tracks.
- The media server must enforce `room.auto_create: false` and a two-person limit. The backend creates the room explicitly, and V21 stores durable room leases. A cleanup worker deletes expired, cancelled, completed or rescheduled rooms, and test rooms whose dentist is no longer eligible. Failed deletions are retried. The worker runs every 15 seconds while the Java service is running.
- The appointment browser also revalidates access every 15 seconds and closes on failure. Native rooms stop at their scheduled expiry. No system can promise immediate remote disconnect while the API/media control plane is unavailable; monitor cleanup failures and keep the API running continuously.
- `GET /api/public/video-consultations/status` reports configuration readiness. Creating a room additionally checks control-plane connectivity. Neither proves audio/video or TURN delivery; that needs a live media test.

## Release verification

Run the Angular video tests and backend video/access tests. On the deployed media server, test two browsers/devices, microphone and camera both ways, permission denial, mute, leaving during device prompts, expired invitations, reconnection, unauthorized access, cancellation and rescheduling. Repeat using mobile data and forced TURN/TLS. Confirm cleanup survives a backend restart.

References: [LiveKit deployment](https://docs.livekit.io/transport/self-hosting/vm/), [access grants](https://docs.livekit.io/frontends/reference/tokens-grants/), [JavaScript SDK](https://docs.livekit.io/reference/client-sdk-js/).