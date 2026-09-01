# Outbound AI Calling Runbook

Outbound lead calls are fully administrator-controlled. The pipeline only identifies eligible leads. It never chooses a call time, starts a call, schedules a call, or retries a call automatically.

Keep `LEAD_AI_CALLING_ENABLED=false` until every release gate in this document passes.

## Runtime Flow

1. A super admin opens **AI call** for one lead.
2. The admin chooses **Call now** or **Schedule later**, verifies explicit automated-call permission again, and records the evidence.
3. The API rechecks consent, opt-out state, phone format, calling hours, cooldown, and attempt count in a Firestore transaction.
4. Only the final **Confirm & call now** or **Confirm schedule** action sends one request to Vapi using a pinned, published assistant version. Immediate calls do not include a provider schedule.
5. Authenticated `status-update` and `end-of-call-report` webhooks update the lead.
6. Only the normalized outcome and a short summary are saved. Raw transcripts and recordings are not saved in Firestore.
7. **Cancel AI call** deletes a pending provider call before changing its pipeline status. **Mark do not call** does the same, revokes consent, and blocks future calls.
8. If the lead later opts back in, **Record new consent** requires fresh evidence and restores eligibility without queuing a call or resetting attempt limits.

The server enforces these limits:

- Explicit consent evidence for every queue request
- An explicit `now` or `scheduled` choice for every call request
- No background dialing, automatic scheduling, campaigns, or automatic retries
- India phone normalization
- Monday-Saturday, 9:00 AM-7:00 PM India time
- A 15-minute provider execution window, capped at 7:00 PM India time
- At least 10 minutes and no more than 30 days ahead
- Maximum 3 attempts per lead
- At least 24 hours between scheduled attempts
- One active AI call per lead
- Super-admin authentication for queue, cancel, opt-out, and re-consent actions
- Monotonic provider states, current-call identity checks, and idempotent end-of-call activity records

## Vercel Variables

Configure these as encrypted server-side variables for Production. Use separate Vapi resources and secrets for Preview.

| Variable | Value |
|---|---|
| `LEAD_AI_CALLING_ENABLED` | `false` during setup; change to `true` only at the final gate |
| `VAPI_API_KEY` | Restricted Vapi private API key |
| `VAPI_LEAD_ASSISTANT_ID` | Saved outbound lead assistant ID |
| `VAPI_LEAD_ASSISTANT_VERSION` | Reviewed published version label, such as `v1` |
| `VAPI_PHONE_NUMBER_ID` | Imported, outbound-capable caller number ID |
| `VAPI_WEBHOOK_SECRET` | Random secret of at least 32 characters |

The Firebase Admin variables are also required. `npm run release:check` fails if calling is enabled and any Vapi setting is missing.

The kill switch prevents new queue requests. It deliberately does not disable provider cancellation or webhook processing, so pending calls can still be stopped and reconciled.

## Vapi Assistant

Create a dedicated saved assistant. Do not reuse the patient-facing receptionist.

Minimum configuration:

```json
{
  "firstMessage": "{{openingScript}}",
  "model": {
    "provider": "openai",
    "model": "gpt-4.1-mini"
  },
  "server": {
    "url": "https://mydentalplatform.com/api/lead-ai-call?action=webhook",
    "credentialId": "YOUR_BEARER_CREDENTIAL_ID"
  },
  "serverMessages": ["status-update", "end-of-call-report"],
  "artifactPlan": {
    "recordingEnabled": false,
    "loggingEnabled": false,
    "pcapEnabled": false,
    "transcriptPlan": {
      "enabled": true,
      "assistantName": "Assistant",
      "userName": "Customer"
    },
    "structuredOutputIds": ["YOUR_LEAD_OUTCOME_OUTPUT_ID"]
  }
}
```

Use an OpenAI model currently supported by the Vapi account; the example is a conservative starting point, not a permanent model requirement. Connect an organization-owned OpenAI integration if provider-level billing and retention controls require it.

Create a Vapi **Bearer Token** custom credential with:

- Header name: `Authorization`
- Bearer prefix: enabled
- Token: exactly the same value as `VAPI_WEBHOOK_SECRET`

Publish the assistant and set its version label in `VAPI_LEAD_ASSISTANT_VERSION`. Publishing a new draft does not affect production calls until that variable is intentionally changed.

## Prompt Contract

The assistant prompt must require all of the following:

- Identify itself as an automated AI assistant from My Dental Platform in the first message.
- State that the lead previously agreed to the call and ask whether now is a good time.
- Discuss only clinic website, lead handling, appointment workflow, and a product demo.
- Never provide dental or medical advice, collect patient health details, request payment, or impersonate a human.
- Never claim guaranteed revenue, patient volume, rankings, or clinical outcomes.
- Stop selling after a refusal. If asked not to call again, acknowledge it, end promptly, and classify `opted_out`.
- Treat uncertainty as `unknown`; do not invent interest or a booking.
- Use `demo_booked` only when the lead explicitly agrees to a date and time. A human must still confirm it because this assistant has no calendar booking tool.
- Keep the call brief and end politely when the intended clinic owner is unavailable.

The API supplies only `clinicName`, `doctorName`, `city`, `platformUrl`, `openingScript`, and `leadRequestId` as call variables.

## Structured Output

Create and attach one Vapi structured output named `Lead call result`:

```json
{
  "type": "object",
  "properties": {
    "outcome": {
      "type": "string",
      "enum": [
        "interested",
        "demo_booked",
        "callback_requested",
        "not_interested",
        "no_answer",
        "voicemail",
        "wrong_number",
        "opted_out",
        "unknown"
      ],
      "description": "The most conservative supported outcome of the call."
    },
    "summary": {
      "type": "string",
      "maxLength": 600,
      "description": "A factual next-step summary without patient, clinical, payment, or transcript details."
    }
  },
  "required": ["outcome", "summary"]
}
```

The webhook supports this modern `artifact.structuredOutputs` shape and the older `analysis.structuredData` shape. No-answer, voicemail, invalid-number, cancellation, and provider failures also use Vapi's terminal reason when extraction is absent.

## Privacy And Compliance

- A public listing, purchased list, referral name, or scraped phone number is not automated-call consent.
- Record the permission channel and date in **Consent evidence**. Retain the underlying message or form record according to the approved policy.
- Do not clear an opt-out through ordinary lead editing. Use **Record new consent** only after receiving fresh explicit permission; scheduling remains a separate reviewed action.
- Keep recording disabled. If recording is later required, stop rollout until counsel approves the notice and consent flow; configure Vapi's recording consent plan before enabling it.
- Enable Vapi Zero Data Retention when compatible with the organization's requirements, or document the shortest approved Vapi retention period. ZDR still allows normalized results to arrive through the end-of-call webhook.
- Do not ask for patient names, conditions, treatment, insurance, payment details, or credentials.
- Review Indian telecom, DND, caller identification, calling-hour, and business-consent obligations with qualified local counsel and the carrier before launch.
- Register and monitor the outbound caller identity. Do not rotate numbers to evade spam or opt-out controls.

## Budget And Rollout

Set provider concurrency to 1 and use a low organization spend alert or cap. Keep automatic balance reload disabled or tightly capped during the pilot.

1. **Disabled:** deploy with `LEAD_AI_CALLING_ENABLED=false`; verify the queue API fails closed.
2. **Internal:** call only team-owned numbers. Test answer, no-answer, voicemail, wrong-number classification, and webhook authentication.
3. **Control tests:** schedule a call, cancel it in the pipeline, and verify Vapi reports a manual cancellation. Repeat with **Mark do not call** and verify no future call can be queued.
4. **Pilot:** enable at most five leads with independently recorded permission. Review every summary, end reason, cost, and opt-out the same day.
5. **Limited production:** expand only after the pilot has no consent failures, missed cancellations, false outcomes, or unexplained provider errors.

Do not add cron-based or bulk auto-dialing until the reviewed flow has production data, a legal approval, a global daily cap, a provider emergency stop, and an on-call owner.

## Release And Rollback

Before enabling:

```bash
npm run test:leads
npm run lint
npx tsc -p api/tsconfig.json --noEmit
npm run build
npm run release:check
```

To stop new calls, set `LEAD_AI_CALLING_ENABLED=false` and redeploy. Then use the pipeline to cancel every scheduled or queued call; disabling the flag alone does not delete calls already accepted by Vapi. Keep the webhook secret active until all terminal events have arrived.