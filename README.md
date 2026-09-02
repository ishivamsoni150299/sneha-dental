# My Dental Platform

Multi-tenant dental clinic SaaS for patient websites, appointment booking, clinic operations, leads, WhatsApp follow-up, and AI-assisted communication.

Stack: Angular 19, Tailwind CSS v3, Firebase, Vercel, OpenAI Realtime, Anthropic, Razorpay

## Table of Contents

1. Quick Start
2. System Architecture
3. Vercel Frontend and API
4. Firebase Auth and Database
5. Firestore Data Model
6. Multi-Tenancy
7. Routing and Guards
8. Environment Variables
9. One-Time Setup
10. Self-Service Clinic Signup
11. AI Voice and Chat Agents
12. Billing and Subscriptions
13. Deployment
14. Testing

## 1. Quick Start

```bash
npm install
npm start
npm run build
npm test
npm run lint
```

Generate a new standalone page component:

```bash
ng generate component features/<name>/<name> --standalone --style css
```

To run `/api/*` serverless functions locally, use Vercel dev instead of the Angular dev server:

```bash
npx vercel dev
```

## 2. System Architecture

```text
Browser (patient or admin)
  -> Angular SPA on Vercel
  -> /api/* routed to Node serverless functions
  -> Firebase Auth + Firestore for data and access control
  -> Razorpay for subscription billing
   -> OpenAI Realtime for browser voice-receptionist workflows
```

High-level runtime flow:

1. The app reads the current hostname.
2. The clinic config loader resolves that hostname to a Firestore clinic document.
3. Theme, services, hours, doctors, and booking rules are loaded from that clinic document.
4. Patient-facing pages and admin pages render from the same codebase with clinic-specific data.

## 3. Vercel Frontend and API

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist/mydentalplatform/browser/` |
| Runtime | Node 22 |
| Frontend routing | SPA rewrite to `index.html` |
| API routing | `/api/*` to serverless functions |

Current serverless endpoints are designed to stay within the Vercel Hobby plan function limit.

| File | Method | Purpose |
|---|---|---|
| `api/chat.ts` | POST | Website chat receptionist backed by Anthropic |
| `api/create-subscription.ts` | POST | Creates clinic billing checkout |
| `api/openai-voice.ts` | POST/GET | Creates Realtime sessions and manages voice settings and usage |
| `api/voice-booking-action.ts` | POST | Creates a confirmed appointment request from a signed voice session |
| `api/patient.ts` | POST | Verifies patient phone sessions; manages linked appointments; submits and reports appointment-verified reviews |
| `api/lead-ai-call.ts` | POST | Queues, cancels, records consent controls, and reconciles outbound lead calls |
| `api/razorpay-webhook.ts` | POST | Subscription payment status updates |
| `api/self-signup.ts` | POST | Clinic self-onboarding |

## 4. Firebase Auth and Database

Project ID: `sneha-dental-6373b`

Authentication providers:

- Email/password for clinic owners and super admins
- Google OAuth for clinic owners when enabled
- Phone OTP for patient appointment access when enabled

Deploy rules and indexes manually when they change:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## 5. Firestore Data Model

Main collections:

- `clinics`
- `clinics/{clinicId}/private/account`
- `appointments`
- `contacts`
- `leads`
- `superAdmins`
- `analytics`
- `platform`
- `rateLimits` (server-only abuse-control buckets)
- `providerVerifications` (platform-only dentist registration checks)
- `providerVerificationEvents` (append-only marketplace review audit trail)
- `marketplaceSlugs` (platform-only unique public profile reservations)
- `notifications` (idempotent appointment email delivery records)
- `patients` (minimal server-owned phone identity for the appointment portal)
- `appointmentReviews` (public-safe review content; only published records are publicly readable)
- `appointmentReviewModeration` (private appointment ownership and moderation audit records)
- `appointmentReviewReports` (private patient reports and platform resolution state)

Clinic documents contain only public website configuration and the minimum
subscription state needed to enable the clinic site. Owner identity, billing
email, payment references, attribution, and billing controls live in the
authenticated `private/account` subdocument.

New appointment document IDs are SHA-256 lookup keys derived from clinic ID,
booking reference, and phone number. The slot collection therefore never
exposes those values in plain text. Legacy appointment keys remain readable by
the patient lookup flow during migration.

Marketplace status, slug, and patient-facing search profile live on the public
clinic document. Dentist registration numbers, verification notes, reviewer
identity, and audit history stay in platform-only collections. A verified badge
represents an identity and registration check, not a treatment-quality guarantee.

Marketplace bookings reuse the same atomic appointment and slot transaction as
clinic websites. New requests store their source, normalized E.164 phone,
confirmation deadline, and privacy-safe attribution. A marketplace request is
pending until the clinic confirms it. Clinics can decline with a reason;
unanswered requests expire after their two-working-hour response window and the
maintenance worker releases the reserved slot. Cancellation actors distinguish
patient, clinic, and system outcomes. Server-resolved response timestamps drive
confirmation-time and missed-SLA reporting without affecting paid-plan ranking.

Completed linked appointments may create one deterministic review. The patient
API writes public-safe content and private appointment ownership in one server
transaction. New reviews remain pending until a platform administrator publishes
or rejects them. Clinic owners can respond only to their own published reviews;
they cannot edit patient ratings or text. Patient UIDs, appointment IDs, reporter
UIDs, and report details never live in publicly readable review documents.

Initialize existing clinics before enabling marketplace discovery. The command
is a read-only preview unless `--apply` is provided:

```bash
npm run migrate:marketplace-fields
npm run migrate:marketplace-fields -- --apply
```

Typical `clinics` fields include:

- `name`
- `doctorName`
- `phone`
- `domain`
- `vercelDomain`
- `active`
- `subscriptionPlan`
- `subscriptionStatus`
- `billingCycle`
- `trialEndDate`
- `theme`
- `bookingRefPrefix`
- `hours`
- `services`
- `testimonials`
- `adminUid`
- `voiceAgentEnabled`
- `voiceProvider`

## 6. Multi-Tenancy

One Vercel project and one Firebase project serve every clinic.

Boot sequence:

1. `ClinicConfigService` reads `window.location.hostname`.
2. Firestore resolves the hostname to a clinic document.
3. The clinic config signal is populated.
4. Theme variables and public website content are applied from clinic data.

Custom domain flow:

1. Point the clinic domain to Vercel.
2. Save that domain in the clinic Firestore document.
3. Add the domain in the Vercel project.

## 7. Routing and Guards

Patient marketplace routes on `mydentalplatform.com`:

- `/dentists`
- `/dentists/:slug`
- `/dentists/:slug/book`
- `/appointments`

The platform root redirects to `/dentists`. Clinic websites keep their own
hostname-scoped public routes:

- `/`
- `/services`
- `/about`
- `/appointment`
- `/appointment/confirmed`
- `/my-appointment`
- `/gallery`
- `/testimonials`
- `/contact`

Business routes:

- `/business`
- `/business/signup`
- `/business/login`
- `/business/clinic/*`
- `/business/clinic/reviews`
- `/business/clinics`
- `/business/reviews`
- `/business/revenue`
- `/business/analytics`
- `/business/leads`

Security guards:

- `clinic-required.guard`
- `clinic-admin.guard`
- `super-admin.guard`

## 8. Environment Variables

Set all server-side values in the Vercel project settings. For local work, copy `.env.example` to `.env.local`.

| Variable | Required | Purpose |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Yes | Firebase Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase Admin SDK |
| `ANTHROPIC_API_KEY` | Yes | Chat assistant |
| `OPENAI_API_KEY` | Yes | OpenAI Realtime website voice receptionist |
| `OPENAI_VOICE_SIGNING_SECRET` | Yes | Signs short-lived voice booking capabilities |
| `OPENAI_REALTIME_MODEL` | Optional | Realtime model override; defaults to `gpt-realtime-2.1` |
| `OPENAI_TRANSCRIPTION_MODEL` | Optional | Input transcription model override |
| `LEAD_AI_CALLING_ENABLED` | Optional | Fail-closed outbound lead-call switch; must equal `true` to queue calls |
| `VAPI_API_KEY` | Required when enabled | Vapi private API key for outbound calls and cancellation |
| `VAPI_LEAD_ASSISTANT_ID` | Required when enabled | Dedicated outbound lead assistant |
| `VAPI_LEAD_ASSISTANT_VERSION` | Required when enabled | Pinned published assistant version |
| `VAPI_PHONE_NUMBER_ID` | Required when enabled | Imported outbound caller number |
| `VAPI_WEBHOOK_SECRET` | Required when enabled | Vapi bearer credential; at least 32 characters |
| `RAZORPAY_KEY_ID` | Yes | Razorpay API |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay API |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Razorpay webhook verification |
| `RAZORPAY_PLAN_STARTER` | Optional | Legacy monthly fallback for Starter |
| `RAZORPAY_PLAN_STARTER_MONTHLY` | Yes for subscriptions | Starter monthly plan id |
| `RAZORPAY_PLAN_STARTER_YEARLY` | Yes for subscriptions | Starter yearly plan id |
| `RAZORPAY_PLAN_PRO` | Optional | Legacy monthly fallback for Pro |
| `RAZORPAY_PLAN_PRO_MONTHLY` | Yes for subscriptions | Pro monthly plan id |
| `RAZORPAY_PLAN_PRO_YEARLY` | Yes for subscriptions | Pro yearly plan id |
| `PUBLIC_RAZORPAY_ME_URL` | Recommended | Manual backup payment link |
| `VERCEL_TOKEN` | Yes | Vercel API for self-signup domain setup |
| `VERCEL_PROJECT_ID` | Yes | Vercel project id |
| `APP_BASE_URL` | Yes | Platform base URL |
| `GOOGLE_MAPS_API_KEY` | Optional | Places autocomplete |

Angular Firebase client config stays in `src/environments/environment.ts`. Those browser keys are public and safe to ship.

## 9. One-Time Setup

### Firebase Service Account

1. Firebase Console -> Project Settings -> Service Accounts
2. Generate a new private key
3. Copy `project_id`, `client_email`, and `private_key` into Vercel env vars

### Firebase Phone Authentication

Patient portal OTP is disabled until the Firebase project is configured:

1. Enable the Phone provider in Firebase Authentication.
2. Allow India in the Authentication SMS region policy.
3. Add `mydentalplatform.com`, `www.mydentalplatform.com`, and each test host to authorised domains.
4. Configure Firebase test phone numbers before using real SMS messages.
5. Confirm reCAPTCHA works on desktop and mobile, then monitor SMS quota, abuse, and billing alerts.
6. Deploy the updated Firestore rules and indexes only after emulator authorization tests pass.

Phone-only users resolve to the `patient` role. Clinic and platform accounts still
require verified email. The browser never reads full patient appointment documents;
`/api/patient` verifies the Firebase ID token and returns a DTO that excludes
clinical notes, treatment details, payment data, raw contact fields, and internal
lookup keys.

### Razorpay

1. Complete Razorpay account setup and KYC
2. Copy `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
3. Create four hosted subscription plans in Razorpay:
   - Starter monthly: Rs 999
   - Starter yearly: Rs 9999
   - Pro monthly: Rs 2499
   - Pro yearly: Rs 24999
4. Save those ids in the matching env vars
5. Add webhook:
   - URL: `https://www.mydentalplatform.com/api/razorpay-webhook`
   - Events: `subscription.authenticated`, `subscription.pending`, `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `subscription.resumed`
   - Secret: `RAZORPAY_WEBHOOK_SECRET`
6. Set `PUBLIC_RAZORPAY_ME_URL=https://razorpay.me/@mydentalplatform` as a manual fallback payment path

Recommended billing setup:

- Primary: Razorpay hosted subscriptions for automatic recurring billing
- Backup: Razorpay.me manual payment link for cases where subscription env vars are missing or you want a simple manual collection path

### OpenAI Realtime Voice

1. Create a restricted OpenAI project API key and set `OPENAI_API_KEY` only on the server.
2. Generate a separate random signing secret and set `OPENAI_VOICE_SIGNING_SECRET`.
3. Enable OpenAI voice for an active Pro clinic from the platform clinic list.
4. Test microphone permission, interruption, session timeout, and a confirmed booking on the clinic's real domain.

The current implementation handles live voice inside the clinic website through WebRTC. Answering a public telephone number requires a separately configured SIP or telephony carrier; an OpenAI API key alone does not provide PSTN calling.

Consent-based outbound lead qualification uses a separate Vapi phone assistant backed by an OpenAI model. Keep it disabled until the setup, privacy, cancellation, budget, and pilot gates in [docs/OUTBOUND_AI_CALLING.md](docs/OUTBOUND_AI_CALLING.md) pass.

### Vercel API Token

Used by self-signup to register clinic subdomains:

1. Create a Vercel token
2. Set `VERCEL_TOKEN`
3. Copy the Vercel project id
4. Set `VERCEL_PROJECT_ID`

## 10. Self-Service Clinic Signup

Clinic onboarding lives at `/business/signup`.

What happens automatically:

1. Firebase Auth owner account is created
2. Firestore clinic document is created
3. A clinic subdomain is assigned
4. The selected plan and billing cycle are stored
5. For paid plans, checkout is generated through Razorpay subscriptions when configured
6. If subscription setup is missing, the flow falls back to the Razorpay.me payment link

## 11. AI Voice and Chat Agents

Text chat:

- Website widget powered by Anthropic
- Context-aware prompt based on clinic profile and services

Voice agent:

- Available only for Pro clinics with active access
- Negotiates OpenAI Realtime WebRTC through the server; no OpenAI credential reaches the browser
- Uses clinic-specific facts, greeting, language, persona, and OpenAI voice settings
- Creates an appointment request only after explicit patient confirmation through a signed, short-lived session capability
- Enforces a session timeout, request rate limit, monthly voice budget, and phone/WhatsApp fallback

## 12. Billing and Subscriptions

| Plan | Monthly | Yearly | Notes |
|---|---|---|---|
| Free | Rs 0 | Rs 0 | Trial or restricted starter access depending on workflow |
| Starter | Rs 999 | Rs 9999 | Website, booking, dashboard and email alerts, WhatsApp lead flow |
| Pro | Rs 2499 | Rs 24999 | Starter plus AI voice and advanced workflows |

Current payment flow:

1. User selects Starter or Pro and a billing cycle
2. Frontend calls `/api/create-subscription` or `/api/self-signup`
3. If Razorpay subscription plans are configured, the user gets a hosted subscription checkout URL
4. If not, the API returns the `PUBLIC_RAZORPAY_ME_URL` manual payment link
5. Razorpay webhook updates Firestore subscription state after payment events

Stored subscription state includes:

- `subscriptionPlan`
- `billingCycle`
- `subscriptionStatus`
- `razorpaySubscriptionId`
- `lastPaymentDate`
- `lastPaymentAmount`
- `subscriptionEndDate`

## 13. Deployment

Vercel auto-deploys on push to `main`.

```bash
git push origin main
```

Manual deploy:

```bash
npx vercel --prod
```

Firebase deploys are separate:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Vercel Hobby invokes `/api/cron-trial-expiry` daily at 02:30 UTC as a safety
run. Configure an external scheduler to call the same endpoint every 15 minutes
to enforce marketplace confirmation deadlines promptly. In addition to
subscription maintenance, the worker expires overdue marketplace requests,
releases their slots transactionally, and sends an idempotent patient notice.
Set `CRON_SECRET` in production so only authorized maintenance calls run. The
external scheduler must send `Authorization: Bearer <CRON_SECRET>`.

Before deploying the private clinic schema, preview the one-time migration with
production Firebase Admin environment variables loaded:

```bash
npm run migrate:clinic-private-data
npm run migrate:clinic-private-data -- --apply
```

The migration copies private values first, refreshes clinic-owner custom claims,
and then removes those values from the public clinic document.

Recommended validation before pushing:

```bash
npm run build
```

`npm run lint` currently has substantial pre-existing repo debt, so build verification is the reliable gate for this repository right now.

## 14. Testing

Primary commands:

```bash
npm test
npm run build
npm run test:appointments
npm run test:subscriptions
npm run test:seo
npm run test:voice
npm run test:leads
```

Critical areas to cover when adding tests:

1. Guards
2. Appointment booking and cancellation
3. Auth and session restore
4. Doctor slot calculations
5. Clinic config loading by domain
