# My Dental Platform

> Multi-tenant dental clinic SaaS — one codebase, unlimited clinics.  
> **Stack:** Angular 19 · Tailwind CSS v3 · Firebase · Vercel · ElevenLabs · Claude AI · Razorpay

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [System Architecture](#2-system-architecture)
3. [Vercel — Frontend & API](#3-vercel--frontend--api)
4. [Firebase — Auth & Database](#4-firebase--auth--database)
5. [Firestore Data Model](#5-firestore-data-model)
6. [Multi-Tenancy](#6-multi-tenancy)
7. [Routing & Guards](#7-routing--guards)
8. [Environment Variables](#8-environment-variables)
9. [One-Time Setup](#9-one-time-setup)
10. [Self-Service Clinic Signup](#10-self-service-clinic-signup)
11. [AI Voice & Chat Agents](#11-ai-voice--chat-agents)
12. [Billing — Razorpay](#12-billing--razorpay)
13. [Deployment](#13-deployment)
14. [Testing](#14-testing)

---

## 1. Quick Start

```bash
npm install          # install dependencies (uses legacy-peer-deps via .npmrc)
npm start            # dev server → http://localhost:4200
npm run build        # production build → dist/mydentalplatform/browser/
npm test             # unit tests (Karma + Jasmine)
npm run lint         # ESLint

# Generate a new page component
ng generate component features/<name>/<name> --standalone --style css
```

> **Local API functions:** To run `/api/*` serverless functions locally, use `npx vercel dev` instead of `npm start`.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       BROWSER (Patient / Admin)                  │
│   clinicname.mydentalplatform.com  OR  snehadental.com           │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                         VERCEL EDGE                              │
│  • Serves Angular SPA  (dist/mydentalplatform/browser/)          │
│  • Routes /api/* → Node 18 serverless functions                  │
│  • SPA catch-all: everything else → index.html                   │
└────────────┬──────────────────────────────┬──────────────────────┘
             │ SPA                           │ /api/*
             ▼                              ▼
┌───────────────────────┐     ┌─────────────────────────────────┐
│   Angular 19 App      │     │   8 Serverless API Functions    │
│                       │     │                                  │
│  APP_INITIALIZER      │     │  chat.ts                         │
│    → hostname lookup  │     │  create-subscription.ts          │
│    → Firestore query  │     │  elevenlabs-create-agent.ts      │
│    → load clinic doc  │     │  elevenlabs-update-agent.ts      │
│    → render UI        │     │  elevenlabs-usage.ts             │
│                       │     │  elevenlabs-webhook.ts           │
│  Firebase Client SDK  │     │  razorpay-webhook.ts             │
│  ElevenLabs SDK       │     │  self-signup.ts                  │
└────────────┬──────────┘     └────────────┬────────────────────┘
             │                             │
             ▼                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     FIREBASE (sneha-dental-6373b)                │
│                                                                  │
│  Authentication:  Email/Password + Google OAuth                  │
│  Firestore:       clinics · appointments · leads · platform …    │
│  Security Rules:  firestore.rules (role-based, owner-scoped)     │
└────────────┬─────────────────────────────────────────────────────┘
             │
     ┌───────┴────────────────────────────┐
     ▼                                    ▼
┌──────────────┐                  ┌──────────────────┐
│  ElevenLabs  │                  │    Razorpay       │
│  Voice Agent │                  │  Subscription     │
│  (per clinic)│                  │  Billing          │
└──────────────┘                  └──────────────────┘
```

---

## 3. Vercel — Frontend & API

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist/mydentalplatform/browser/` |
| Framework | `null` (Angular custom build) |
| Node runtime | 18.x |
| SPA rewrite | `/*` → `index.html` |
| API rewrite | `/api/*` → serverless functions |

### 8 Serverless API Functions

| File | Method | Purpose |
|------|--------|---------|
| `api/chat.ts` | POST | Claude Haiku AI text receptionist for website chat widget |
| `api/create-subscription.ts` | POST | Create Razorpay plan + subscription for clinic billing |
| `api/elevenlabs-create-agent.ts` | POST | Provision ElevenLabs voice agent for a new clinic |
| `api/elevenlabs-update-agent.ts` | POST | Sync voice agent greeting, language, persona settings |
| `api/elevenlabs-usage.ts` | GET | Monthly voice agent usage stats (conversations, minutes) |
| `api/elevenlabs-webhook.ts` | POST | Post-call webhook: extract booking details → Firestore |
| `api/razorpay-webhook.ts` | POST | Payment events → update clinic subscription status |
| `api/self-signup.ts` | POST | Full clinic onboarding: Firebase Auth + Firestore + Vercel domain + Razorpay |

All API functions use **Firebase Admin SDK** for privileged Firestore writes, and verify webhook signatures before processing.

---

## 4. Firebase — Auth & Database

**Project ID:** `sneha-dental-6373b` *(Firebase project identifier — cannot be renamed)*

### Authentication

| Provider | Used by |
|----------|---------|
| Email / Password | Clinic owners, platform super admins |
| Google OAuth | Clinic owners (optional) |

Two separate auth services:
- `AuthService` — clinic staff login → `/business/login` → accesses `/business/clinic/*`
- `SuperAuthService` — platform admin login → accesses `/business/clinics`, revenue, leads

### Deploying Security Rules

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

---

## 5. Firestore Data Model

```
clinics/{clinicId}
  Fields: name, doctorName, phone, domain, vercelDomain, active,
          subscriptionPlan, subscriptionStatus, trialEndDate,
          theme, bookingRefPrefix, hours, services, plans,
          testimonials, adminUid, elevenLabsAgentId, createdAt
  Rules:  public read · superAdmin create · owner/superAdmin update+delete

  └── doctors/{doctorId}
        Fields: name, qualification, speciality, available,
                schedule (Record<weekday, {enabled,start,end}>), createdAt
        Rules:  public read · clinic owner write

appointments/{appointmentId}
  Fields: clinicId, bookingRef, name, phone, email, service, date, time,
          doctorId, doctorName, message, status, source, createdAt
  Rules:  public create+read · auth update+delete

contacts/{docId}
  Fields: clinicId, name, phone, email, message, createdAt
  Rules:  public create · superAdmin manage

leads/{leadId}
  Fields: clinicName, doctorName, phone, city, source, status,
          followUpDate, notes, referredBy, createdAt
  Rules:  authenticated only

  └── activities/{activityId}
        Fields: type (whatsapp|called|note|status_change), note, createdAt
        Rules:  authenticated only

superAdmins/{uid}
  Fields: (document existence = access granted)
  Rules:  read own doc only · no client writes (seeded via Admin SDK)

analytics/{docId}
  Fields: totalBookings, monthlyBookings, ...
  Rules:  public write (atomic increments) · auth read

platform/{docId}
  Fields: monthlyCosts (vercel, firebase, domain, other)
  Rules:  superAdmin only
```

**Firestore indexes** (`firestore.indexes.json`):
- `appointments`: `(clinicId, bookingRef, phone)` — patient lookup
- `appointments`: `(clinicId, createdAt DESC)` — admin dashboard list

---

## 6. Multi-Tenancy

One Vercel deployment, one Firebase project — serves every clinic.

**Boot sequence:**
```
1. APP_INITIALIZER calls ClinicConfigService.loadFromFirestore()
2. Reads window.location.hostname
3. Firestore query: clinics WHERE domains array-contains hostname
   (falls back to vercelDomain match on second attempt)
4. Loads clinic doc → stores in ClinicConfigService signal
5. ThemeService applies CSS vars: --accent, --accent-dk, --accent-sh
6. All components read from ClinicConfigService.config
```

**Adding a new clinic:**
- Use `/business/clinics/new` in the super admin panel, OR
- Direct to `/business/signup` for self-service (fully automated)

**Custom domains** (e.g. `snehadental.com`):
1. Clinic owner adds CNAME → Vercel in their DNS
2. Add `domain: 'snehadental.com'` to their Firestore doc
3. Add domain in Vercel dashboard for this project

---

## 7. Routing & Guards

```
/                        → HomeComponent          (ClinicLayout)
/services                → ServicesComponent
/about                   → AboutComponent
/appointment             → AppointmentComponent
/appointment/confirmed   → ConfirmedComponent
/my-appointment          → MyAppointmentComponent
/gallery                 → GalleryComponent
/testimonials            → TestimonialsComponent
/contact                 → ContactComponent
/coming-soon             → ComingSoonComponent

/business                → PlatformLandingComponent  (public)
/business/signup         → SignupComponent
/business/login          → BusinessLoginComponent

/business/clinic/*       → [clinicAdminGuard]
  /dashboard             → AdminDashboardComponent
  /settings              → AdminSettingsComponent
  /doctors               → AdminDoctorsComponent

/business/clinics        → [superAdminGuard]
/business/revenue        → RevenueComponent
/business/analytics      → AnalyticsComponent
/business/leads          → LeadListComponent
...

/admin/login             → redirect → /business/login
/admin                   → redirect → /business/clinic/dashboard
```

**Guard chain:**
```
clinic-required.guard  →  blocks clinic routes when no clinic doc loaded
clinic-admin.guard     →  /business/clinic/* — requires auth + clinicId claim
super-admin.guard      →  /business/clinics,revenue,leads — requires superAdmins/{uid}
```

---

## 8. Environment Variables

All set in **Vercel Dashboard → Project → Settings → Environment Variables**.  
For local dev, copy `.env.example` → `.env.local` and fill in values.

| Variable | Required | Source |
|----------|----------|--------|
| `FIREBASE_PROJECT_ID` | Yes | Firebase Console → Service Accounts |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase Console → Service Accounts |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase Console → Service Accounts |
| `ANTHROPIC_API_KEY` | Yes | console.anthropic.com/account/keys |
| `ELEVENLABS_API_KEY` | Yes | elevenlabs.io → Settings → API Keys |
| `ELEVENLABS_WEBHOOK_SECRET` | Yes | Random string — set same in ElevenLabs dashboard |
| `RAZORPAY_KEY_ID` | Yes | dashboard.razorpay.com → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Yes | dashboard.razorpay.com → Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Random string — set same in Razorpay dashboard |
| `RAZORPAY_PLAN_STARTER` | Yes | Razorpay plan ID for ₹499/mo |
| `RAZORPAY_PLAN_PRO` | Yes | Razorpay plan ID for ₹999/mo |
| `VERCEL_TOKEN` | Yes | vercel.com → Account Settings → Tokens |
| `VERCEL_PROJECT_ID` | Yes | Vercel → Project → Settings → General |
| `APP_BASE_URL` | Yes | `https://mydentalplatform.com` |
| `GOOGLE_MAPS_API_KEY` | Optional | Google Cloud Console (Maps JS + Places API) |

> **Angular client-side Firebase config** (`apiKey`, `appId`, etc.) lives in  
> `src/environments/environment.ts` — these are **public keys**, safe to commit.

---

## 9. One-Time Setup

### Firebase Service Account

1. Firebase Console → Project Settings → Service Accounts → **Generate new private key**
2. Download the JSON file
3. Add `project_id`, `client_email`, `private_key` to Vercel env vars

### Razorpay

1. Sign up at razorpay.com and complete KYC
2. Dashboard → Settings → API Keys → copy `Key ID` and `Key Secret`
3. Create two subscription plans (Dashboard → Products → Subscriptions → Plans):
   - **Starter** — ₹499/month
   - **Pro** — ₹999/month
4. Copy the `plan_xxx` IDs → set as `RAZORPAY_PLAN_STARTER` and `RAZORPAY_PLAN_PRO`
5. Dashboard → Settings → Webhooks → Add webhook:
   - URL: `https://mydentalplatform.vercel.app/api/razorpay-webhook`
   - Events: all `subscription.*`
   - Secret: set as `RAZORPAY_WEBHOOK_SECRET`

### ElevenLabs

1. Sign up at elevenlabs.io
2. Settings → API Keys → copy key → set as `ELEVENLABS_API_KEY`
3. Dashboard → Webhooks → Add endpoint:
   - URL: `https://mydentalplatform.vercel.app/api/elevenlabs-webhook`
   - Secret: set as `ELEVENLABS_WEBHOOK_SECRET`
4. Each clinic gets its own voice agent via the **"Create Voice Agent"** button in `/business/clinics`

### Vercel API Token

Required for `self-signup.ts` to register new clinic subdomains programmatically:

1. vercel.com → Account Settings → Tokens → Create token (scope: Full Account)
2. Set as `VERCEL_TOKEN`
3. Vercel → mydentalplatform project → Settings → General → copy **Project ID**
4. Set as `VERCEL_PROJECT_ID`

---

## 10. Self-Service Clinic Signup

Clinics sign up themselves at `/business/signup` — no manual work needed.

**What happens automatically:**
1. Firebase Auth user created for clinic owner
2. Firestore `clinics` document created with unique `clinicId`
3. Subdomain assigned and live: `clinicname.mydentalplatform.com`
4. 30-day free trial started
5. If paid plan: Razorpay subscription created, payment link shown

**Infrastructure required (one-time):**

Add a wildcard DNS record in your domain registrar (e.g. Hostinger):

| Type | Name | Points to | TTL |
|------|------|-----------|-----|
| CNAME | `*` | `cname.vercel-dns.com` | 3600 |

This routes every `*.mydentalplatform.com` subdomain to Vercel.

**Your ongoing role after setup:**
- **Custom domains** — add `domain` field to clinic's Firestore doc + configure in Vercel
- **Content updates** — use `/business/clinics/:id/edit`
- **Monitoring** — check `/business/revenue` and `/business/analytics`

---

## 11. AI Voice & Chat Agents

### Text Chat (Claude Haiku)

- Widget: `VoiceAgentComponent` in `ClinicLayout` — active for all clinics
- Backend: `POST /api/chat` → Anthropic API (`claude-haiku-4-5-20251001`)
- System prompt scoped to clinic name + services, 250 token limit
- Last 10 messages kept as history for context

### Voice Agent (ElevenLabs)

- Active only for **Pro plan** clinics with `subscriptionStatus: 'active'`
- Each clinic has its own ElevenLabs agent (stored as `elevenLabsAgentId` in Firestore)
- Create agent: `POST /api/elevenlabs-create-agent` (called from `/business/clinics`)
- Post-call webhook: `POST /api/elevenlabs-webhook` → extracts name, phone, service, date/time → creates `appointments` doc

**Agent configuration** (editable in `/business/clinic/settings` → Voice Agent tab):
- Greeting message
- Language (Hindi/English/Hinglish)
- Persona/tone
- Voice selection

---

## 12. Billing — Razorpay

| Plan | Price | Features |
|------|-------|---------|
| Free Trial | ₹0 / 30 days | Full platform access |
| Starter | ₹499/mo | Website, booking, WhatsApp |
| Pro | ₹999/mo | + Voice agent, advanced analytics |

**Payment flow:**
1. Super admin clicks "Send Payment Link" in `/business/clinics`
2. `POST /api/create-subscription` creates Razorpay plan + subscription
3. Short payment URL sent to clinic owner via WhatsApp
4. Clinic pays → Razorpay fires `subscription.activated` webhook
5. `POST /api/razorpay-webhook` updates Firestore: `subscriptionStatus: 'active'`
6. If payment fails → `subscription.halted` → clinic site auto-suspends

---

## 13. Deployment

### Vercel (primary — auto-deploys on every push to `main`)

```bash
git push origin main   # triggers Vercel deployment automatically
```

Manual deploy:
```bash
npx vercel --prod
```

### Firebase (rules + indexes — deploy manually when changed)

```bash
firebase deploy --only firestore:rules     # after editing firestore.rules
firebase deploy --only firestore:indexes   # after editing firestore.indexes.json
firebase deploy --only hosting             # if using Firebase Hosting instead of Vercel
```

### Build verification before pushing

```bash
npm run build    # must succeed with zero errors
npm run lint     # must produce zero warnings (max-warnings=0)
```

---

## 14. Testing

**Runner:** Karma + Jasmine (`npm test`)  
**Current coverage:** Guards and key services have spec files. Components are untested.

### Coverage Targets

| Layer | Target |
|-------|--------|
| Guards | 100% — security must not regress |
| Core services (auth, appointment, billing) | 90% |
| Utilities / helpers | 95% |
| Shared components | 70% |
| Feature components | 50% |
| **Overall** | ≥65% |

### Critical Test Areas (priority order)

1. **Guards** — `clinic-required.guard`, `clinic-admin.guard`, `super-admin.guard`
2. **`appointment.service.ts`** — `bookAppointment()`, `cancelAppointment()` (24h rule), `getByRef()`
3. **`auth.service.ts`** — login, logout, `isLoggedIn` signal, session restore
4. **`doctor.service.ts`** — `getAvailableSlots()` (slot subtraction logic)
5. **`clinic-config.service.ts`** — domain → Firestore → config load

### Running with Firebase Emulator (integration tests)

```bash
firebase emulators:start --only firestore,auth
npm test
```

Integration tests in `auth.service.spec.ts` are marked `pending` until emulator is available.

### E2E (future — Playwright recommended)

Three critical journeys to cover:
1. Patient books appointment end-to-end
2. Admin confirms → marks completed
3. Clinic owner logs in → changes settings → logs out
