# LiveKit Cloud Build setup

Use the existing consultation UI with LiveKit Cloud's free Build plan. No VPS, separate TURN installation, AI agent, recording, or subscription upgrade is required for this two-person call integration.

1. Sign in at https://cloud.livekit.io and create a project named **My Dental Platform**, selecting **Build ($0)**.
2. Copy the project's WebSocket URL (`wss://your-project.livekit.cloud`). Open its API Keys section and create/copy a key and secret.
3. In Render, open the existing **mydentalplatform** web service, then **Environment**. Add these values together:

```dotenv
VIDEO_PROVIDER=livekit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-project-api-key
LIVEKIT_API_SECRET=your-project-api-secret
```

Use the real values in Render only, never in Git or frontend environment files. Save and deploy after all four are set. Keep the Build plan; do not enable paid upgrades or extra services.

4. Check `/api/health` and `/api/public/video-consultations/status`. Then sign in as a verified dentist, open `/professional/video-test`, and use its temporary invitation on a second device. Verify both audio and video, camera/microphone controls, leaving, and reconnecting. Use one device on mobile data to test TURN connectivity.
5. Check a confirmed video booking: account ownership, assigned dentist access, cancellation, expiry, and that an old room token cannot reconnect after cleanup. Cloud cleanup revokes both participant identities before deleting the room; failed cleanup is retained for retry. No self-hosted YAML setting is required for Cloud.

## Free limits checked 14 September 2026

Build is $0/month with 5,000 WebRTC participant-minutes, 50 GB downstream data, and up to 100 concurrent participants. A 30-minute dentist/patient call uses about 60 participant-minutes, plus any separate waiting time. The data allowance can be reached before the minute allowance. The free tier caps requests when allowances are exhausted rather than charging overages. Allowances are shared across the user's free projects and reset monthly. Check Billing/Usage in the Cloud dashboard.

These are LiveKit costs only. Existing application/database hosting has its own plan. Render's free service can sleep; server cleanup requires a running API and healthy control-plane connection. Do not describe this as unlimited free video or as production-verified before the two-device and access tests pass.

Sources: [Pricing](https://livekit.com/pricing), [Quotas and limits](https://docs.livekit.io/deploy/admin/quotas-and-limits/), [Cloud participant revocation](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).
