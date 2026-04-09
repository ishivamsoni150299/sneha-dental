# Voice Agent Setup (Vapi.ai)

AI phone receptionist + website mic widget for each clinic. Speaks Hinglish.
Do this once, then "Create Voice Agent" works for every clinic.

---

## Step 1 — Vapi Account

Sign up at https://vapi.ai

From the dashboard get:
- **API Key** (private — goes in Vercel, never in browser code)
- **Public Key** (safe for browser — also goes in Vercel so we can store it in Firestore)

---

## Step 2 — Add Env Vars to Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

| Variable | Value |
|---|---|
| `VAPI_API_KEY` | Private API key from Step 1 |
| `VAPI_PUBLIC_KEY` | Public key from Step 1 |
| `VAPI_WEBHOOK_SECRET` | Create any strong random string (e.g. 32 random chars) |

After adding, **redeploy** the project.

---

## Step 3 — Set Webhook in Vapi Dashboard

Go to: **Vapi Dashboard → Settings → Webhooks**

- URL: `https://YOUR-VERCEL-DOMAIN.vercel.app/api/vapi-webhook`
- Secret: same value as `VAPI_WEBHOOK_SECRET` above

---

## Step 4 — Create Voice Agent per Clinic

In `/business/clinics`, each clinic card shows **"Create Voice Agent"** (purple button).

Click it → Vapi assistant is created automatically with:
- The clinic's name, doctor, address, hours, services
- Hinglish greeting and booking flow
- Indian female voice (ElevenLabs)

Once created, the card shows **"Voice Agent Active"** badge.

---

## Step 5 — Phone Calls (optional)

To let patients *call* the AI:

1. In Vapi Dashboard → **Phone Numbers** → Buy an Indian number (or connect Twilio)
2. Assign it to the clinic's assistant
3. Give the clinic owner that number
4. They can optionally forward their existing clinic number to it for missed calls

---

## How It Works After Setup

**Website widget:** A purple mic button appears automatically on the clinic's website
(bottom-right, above the WhatsApp button). Patient clicks → speaks → AI responds.

**Phone calls:** Patient calls → AI picks up → books appointment → Firestore gets a
new `appointments` doc with `source: 'voice'` and `status: 'pending'`.

**Admin dashboard:** Voice bookings appear in the clinic's appointments list like any
other booking (with booking ref starting `VOICE-`).
