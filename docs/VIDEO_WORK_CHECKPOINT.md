# Video calling work checkpoint

User direction: simplify video calling and the UI; push each tested batch.
If execution is interrupted by usage limits, resume from this file and the
working tree when the user returns. Automatic resumption is not scheduled.

The first batch (`5bc65ef`, deployed with both CI jobs passing) makes device checks visible, provides an explicit Listen only
choice, prevents accidental silent joins when both devices fail, clears retry
errors, and blocks chat during reconnection. Floating navigation is hidden
while a native call or preview is open.

The next batch serializes device switching, ignores late device-operation
results after leaving, explicitly stops late tracks, and clears errors after
a successful switch retry. Device selection is disabled during pending work;
the status distinguishes device checks and connection attempts, and uses an
amber indicator while reconnecting.
An old connection failure is also prevented from disconnecting a newer call
after the user leaves and rejoins.

Validation: video component regression tests, lint, production build, and
`scripts/video-call-ui-smoke.mjs` (synthetic sessions and browser devices at
320, 390, 768, 1440 pixels and phone landscape). These checks do not certify
real participant media transport.

Next: verify CI and the deployed frontend after pushing the device-lifecycle fixes. Real two-device
audio/video needs an operator-controlled LiveKit project and the existing
`npm run test:video:media` check; no LiveKit credentials are configured in the
current execution environment. Do not expose credentials in chat or commits.

The older booking-only `video-mobile-ui-smoke.mjs` has stale provider fixtures
and assumptions about hidden navigation. It is separate from the new call UI
check and should be reconciled with the current booking design in a later batch.
