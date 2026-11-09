# Video calling work checkpoint

User direction: simplify video calling and the UI; push each tested batch.
If execution is interrupted by usage limits, resume from this file and the
working tree when the user returns. Automatic resumption is not scheduled.

This batch makes device checks visible, provides an explicit Listen only
choice, prevents accidental silent joins when both devices fail, clears retry
errors, and blocks chat during reconnection. Floating navigation is hidden
while a native call or preview is open.

Validation: video component regression tests, lint, production build, and
`scripts/video-call-ui-smoke.mjs` (synthetic sessions and browser devices at
320, 390, 768, 1440 pixels and phone landscape). These checks do not certify
real participant media transport.

Next: verify CI and the deployed frontend after pushing. Real two-device
audio/video needs an operator-controlled LiveKit project and the existing
`npm run test:video:media` check; no LiveKit credentials are configured in the
current execution environment. Do not expose credentials in chat or commits.

The older booking-only `video-mobile-ui-smoke.mjs` has stale provider fixtures
and assumptions about hidden navigation. It is separate from the new call UI
check and should be reconciled with the current booking design in a later batch.
