# My Dental Platform

Multi-tenant dental clinic SaaS for patient websites, appointment booking, clinic operations, leads, WhatsApp follow-up, and AI-assisted communication.

Stack: Angular 19, Tailwind CSS v3, Firebase, Vercel, ElevenLabs, Anthropic, Razorpay

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
  -> ElevenLabs for voice-agent workflows
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
| Runtime | Node 18 |
| Frontend routing | SPA rewrite to `index.html` |
| API routing | `/api/*` to serverless functions |

Current serverless endpoints are designed to stay within the Vercel Hobby plan function limit.

| File | Method | Purpose |
|---|---|---|
| `api/chat.ts` | POST | Website chat receptionist backed by Anthropic |
| `api/create-subscription.ts` | POST | Creates clinic billing checkout |
| `api/elevenlabs-create-agent.ts` | POST | Provisions a clinic voice agent |
| `api/elevenlabs-update-agent.ts` | POST | Updates voice agent settings |
| `api/elevenlabs-usage.ts` | GET | Voice usage stats |
| `api/elevenlabs-webhook.ts` | POST | Post-call appointment extraction |
| `api/razorpay-webhook.ts` | POST | Subscription payment status updates |
| `api/self-signup.ts` | POST | Clinic self-onboarding |

## 4. Firebase Auth and Database

Project ID: `sneha-dental-6373b`

Authentication providers:

- Email/password for clinic owners and super admins
- Google OAuth for clinic owners when enabled

Deploy rules and indexes manually when they change:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## 5. Firestore Data Model

Main collections:

- `clinics`
- `appointments`
- `contacts`
- `leads`
- `superAdmins`
- `analytics`
- `platform`

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
- `elevenLabsAgentId`

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

Public routes:

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
- `/business/clinics`
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
| `ELEVENLABS_API_KEY` | Yes | Voice agent API |
| `ELEVENLABS_WEBHOOK_SECRET` | Yes | ElevenLabs webhook verification |
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

### ElevenLabs

1. Create an ElevenLabs API key
2. Set `ELEVENLABS_API_KEY`
3. Add webhook URL `https://www.mydentalplatform.com/api/elevenlabs-webhook`
4. Set the same shared secret in Vercel and ElevenLabs

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
- Each clinic can have its own ElevenLabs agent id
- Post-call webhook can create or enrich appointment data

## 12. Billing and Subscriptions

| Plan | Monthly | Yearly | Notes |
|---|---|---|---|
| Free | Rs 0 | Rs 0 | Trial or restricted starter access depending on workflow |
| Starter | Rs 999 | Rs 9999 | Website, booking, WhatsApp lead flow |
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
```

Critical areas to cover when adding tests:

1. Guards
2. Appointment booking and cancellation
3. Auth and session restore
4. Doctor slot calculations
5. Clinic config loading by domain
