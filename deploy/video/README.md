# Independent video server

For LiveKit Cloud's free Build plan, use [the Cloud setup guide](LIVEKIT-CLOUD.md). The VPS instructions below apply only to self-hosting.

The app supports an operator-hosted LiveKit media server. This is open-source software running on your infrastructure; no LiveKit Cloud or Daily account is used in `VIDEO_PROVIDER=livekit` mode. The Java API issues access tokens and the Angular interface renders the call. Your VPS handles media and TURN relay traffic.

## Provision the server

Use the upstream [VM deployment generator](https://docs.livekit.io/transport/self-hosting/vm/) for its TLS, TURN over port 443, Caddy and Docker Compose setup. This avoids a signaling-only deployment that fails on restricted patient networks.

On a machine with Docker, in a private directory outside Git:

```sh
docker pull livekit/generate
docker run --rm -it -v "$PWD:/output" livekit/generate
```

Choose a video domain and a TURN domain, such as `video.your-domain.example` and `turn.your-domain.example`. Do not enable recording, ingress, or egress for this deployment. The generator creates credentials; keep its output private. Pin the generated container images to the tested release before production upgrades.

1. Point both DNS records directly at the VPS public IP. Do not put the media hostname behind an HTTP-only proxy.
2. Merge `livekit-room-policy.yaml` into the generated `livekit.yaml`. **`room.auto_create: false` is required**: the Java API creates rooms after authorization, and deleted rooms must stay closed.
3. Use the generated initialization script/cloud-init to install the stack on the VPS. Apply the room policy to `/opt/livekit/livekit.yaml` too if the initialization script embeds the original configuration, then restart the service.
4. Allow TCP 80/443/7881, UDP 3478 and UDP 50000–60000 as described in the upstream guide. Keep Redis and the internal control port private.
5. Verify both hostnames have trusted TLS certificates, and TURN/TLS works on port 443. Keep Docker/Caddy/LiveKit running on boot. Monitor certificate renewal, CPU, network bandwidth, room cleanup failures, and service availability.

## Connect this application

Set the four values in `backend.env.example` on the Java service, using the API key/secret generated on your VPS. `LIVEKIT_URL` must be a `wss://` origin without a path, query, or credentials. The secret must be at least 32 bytes. Apply Flyway migration V21 and deploy the app.

`VIDEO_PROVIDER` defaults to `daily` to preserve existing installations. Set it explicitly to `livekit` for independent calls. There is **no automatic fallback to Daily** in that mode. A missing/invalid media-server configuration disables new video booking. Room creation also checks the server API before returning a token; a configured URL is not proof that media works.

## Verify before opening patient bookings

Sign in as a verified dentist, open `/professional/video-test`, and share its temporary invitation with a second device. Verify camera preview, microphone meter, sound/video both ways, mute, camera off, permission denial, leave, and reconnect. Repeat with one device on mobile data and a forced TURN/TLS connection (block direct UDP/TCP media in a controlled test). Check an expired invitation is rejected.

Then use a confirmed video appointment during its join window. Check that the patient and assigned dentist can join, another account cannot join, and cancelling/rescheduling/completing the appointment disconnects both peers after the cleanup interval. Also test expiry with the Java server restarted so durable leases are exercised.

The Spring cleanup task runs every 15 seconds and retains failed deletions for retry. Keep the Java service continuously running; do not use a sleeping instance for time-sensitive room cleanup. During an API outage, the normal appointment UI closes calls when access revalidation fails, but server-side cleanup resumes only when the API returns.

No live media delivery or production readiness can be established until these network checks pass against the deployed VPS. Server costs and bandwidth are still required even without a managed video provider.
