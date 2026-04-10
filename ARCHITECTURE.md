# Architecture & Technical Documentation

> **Project:** My Dental Platform — Multi-tenant SaaS for dental clinics  
> **Stack:** Angular 19 · Tailwind CSS · Firebase · Vercel · Vapi.ai · Razorpay  
> **Last Updated:** April 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Frontend — Angular Application](#4-frontend--angular-application)
5. [Backend — Vercel Serverless Functions](#5-backend--vercel-serverless-functions)
6. [Database — Firebase Firestore](#6-database--firebase-firestore)
7. [Authentication](#7-authentication)
8. [Multi-Tenancy Model](#8-multi-tenancy-model)
9. [Routing & Guards](#9-routing--guards)
10. [Services Reference](#10-services-reference)
11. [Billing System — Razorpay](#11-billing-system--razorpay)
12. [AI Voice Agent — Vapi.ai](#12-ai-voice-agent--vapiai)
13. [SEO & Metadata](#13-seo--metadata)
14. [Deployment Pipeline](#14-deployment-pipeline)
15. [Environment Variables](#15-environment-variables)
16. [Data Flow Diagrams](#16-data-flow-diagrams)
17. [Security Model](#17-security-model)
18. [Known Limitations & Future Work](#18-known-limitations--future-work)

---

## 1. System Overview

This is a **multi-tenant dental clinic SaaS platform**. A single codebase and a single Vercel deployment serves every clinic. Domain routing determines which clinic's data is loaded at runtime.

**Two user types:**

| User | URL Pattern | Access |
|------|-------------|--------|
| Clinic patients | `clinicname.vercel.app` or `clinicname.com` | Public website: home, services, book appointment, manage appointment |
| Clinic admin | Same domain → `/admin` | Appointment management, clinic settings |
| Platform super admin | `my-dental-platform.vercel.app/business` | All clinics CRUD, revenue, leads, analytics |

**Key principle:** No separate deployments per clinic. A Firestore query at startup resolves the domain to a clinic doc. The Angular app reconfigures itself entirely based on that doc.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PATIENT BROWSER                          │
│  clinicname.vercel.app or custom domain (snehadental.com)       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VERCEL EDGE                                │
│  - Serves Angular SPA (dist/sneha-dental/browser)              │
│  - Routes /api/* to serverless functions                        │
│  - SPA catch-all: everything else → index.html                  │
└──────────┬──────────────────────────────┬───────────────────────┘
           │                              │
           ▼ SPA                          ▼ /api/*
┌────────────────────┐        ┌──────────────────────────────────┐
│  Angular 19 App    │        │   Vercel Serverless Functions     │
│                    │        │                                    │
│  APP_INITIALIZER   │        │  api/create-subscription.ts       │
│  ↓                 │        │  api/razorpay-webhook.ts          │
│  ClinicConfigSvc   │        │  api/vapi-create-assistant.ts     │
│  → Firestore query │        │  api/vapi-webhook.ts              │
│  → Load clinic doc │        │                                    │
│  → Render UI       │        │  Uses: Firebase Admin SDK         │
│                    │        │        Razorpay SDK               │
│  Firebase SDK      │        │        Vapi REST API              │
│  (client-side)     │        └──────────┬───────────────────────┘
└────────┬───────────┘                   │
         │                               │
         ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FIREBASE (Google Cloud)                       │
│                                                                  │
│  Firestore:   clinics / appointments / leads / platform          │
│  Auth:        clinic admin login, super admin login              │
│  Security:    rules lock client writes to authenticated users    │
└─────────────────────────────────────────────────────────────────┘
         │                               │
         ▼                               ▼
┌────────────────────┐        ┌──────────────────────────────────┐
│    VAPI.AI         │        │          RAZORPAY                 │
│                    │        │                                    │
│  AI phone agent    │        │  Subscription billing             │
│  Website mic widget│        │  Auto-charge monthly/yearly       │
│  Hindi + English   │        │  Webhook → Firestore update       │
└────────────────────┘        └──────────────────────────────────┘
```

---

## 3. Repository Structure

```
c:\dentalprojectnew\
│
├── api/                          # Vercel serverless functions (Node.js)
│   ├── create-subscription.ts    # POST — create Razorpay subscription
│   ├── razorpay-webhook.ts       # POST — Razorpay event handler
│   ├── vapi-create-assistant.ts  # POST — create Vapi AI assistant per clinic
│   └── vapi-webhook.ts           # POST — Vapi end-of-call handler
│
├── src/
│   ├── main.ts                   # Bootstrap Angular app
│   ├── environments/
│   │   ├── environment.ts        # Dev: Firebase client config
│   │   └── environment.prod.ts   # Prod: Firebase client config
│   │
│   └── app/
│       ├── app.component.ts      # Root shell: progress bar + router-outlet
│       ├── app.config.ts         # ApplicationConfig: router + APP_INITIALIZER
│       ├── app.routes.ts         # Top-level lazy routes
│       │
│       ├── core/
│       │   ├── config/
│       │   │   └── clinic.config.ts          # ClinicConfig interface + PLATFORM_PLANS
│       │   ├── guards/
│       │   │   ├── admin.guard.ts            # Blocks /admin if not logged in
│       │   │   ├── clinic-required.guard.ts  # Blocks clinic routes if no clinic loaded
│       │   │   └── super-admin.guard.ts      # Blocks /business/* if not super admin
│       │   ├── services/
│       │   │   ├── appointment.service.ts    # Patient booking CRUD (client SDK)
│       │   │   ├── auth.service.ts           # Clinic admin Firebase Auth
│       │   │   ├── billing.service.ts        # Razorpay subscription helpers
│       │   │   ├── clinic-config.service.ts  # Startup: load clinic from Firestore
│       │   │   ├── clinic-firestore.service.ts # Super admin clinic CRUD
│       │   │   ├── lead-firestore.service.ts # CRM lead CRUD
│       │   │   ├── seo.service.ts            # Dynamic meta/OG/schema per route
│       │   │   ├── super-auth.service.ts     # Super admin Firebase Auth
│       │   │   └── theme.service.ts          # Apply CSS theme class on <html>
│       │   └── utils/
│       │       ├── google-maps-loader.ts     # Lazy-load Google Maps JS SDK
│       │       └── vapi-widget.ts            # Inject Vapi mic button (singleton)
│       │
│       ├── features/
│       │   ├── home/                         # / — Hero, services preview, CTA
│       │   ├── services/                     # /services — Full services catalogue
│       │   ├── about/                        # /about — Doctor + clinic info
│       │   ├── appointment/                  # /appointment — Book form
│       │   │   └── confirmed/               # /appointment/confirmed — Success page
│       │   ├── my-appointment/              # /my-appointment — Lookup & manage
│       │   ├── gallery/                     # /gallery
│       │   ├── testimonials/                # /testimonials
│       │   ├── contact/                     # /contact
│       │   ├── not-found/                   # ** — 404
│       │   ├── admin/
│       │   │   ├── admin-login/             # /admin/login
│       │   │   ├── admin-dashboard/         # /admin — Appointment manager
│       │   │   └── admin-settings/          # /admin/settings — Self-service edit
│       │   └── business/                    # /business/* — Super admin panel
│       │       ├── platform-landing/        # /business — Public SaaS landing
│       │       ├── business-login/          # /business/login
│       │       ├── business-shell/          # Shared layout for /business/* admin
│       │       ├── clinic-list/             # /business/clinics — Manage all clinics
│       │       ├── clinic-form/             # /business/clinics/new|:id/edit
│       │       ├── revenue/                 # /business/revenue — MRR, profit
│       │       ├── analytics/               # /business/analytics — Booking stats
│       │       └── leads/
│       │           ├── lead-list/           # /business/leads — CRM pipeline
│       │           ├── lead-form/           # /business/leads/new|:id/edit
│       │           └── lead-discover/       # /business/leads/discover — Google Places
│       │
│       └── shared/
│           └── components/
│               ├── clinic-layout/           # Wrapper: navbar + router-outlet + footer + WhatsApp button
│               ├── navbar/
│               ├── footer/
│               ├── section-header/
│               ├── service-card/
│               └── testimonial-card/
│
├── angular.json                  # Angular CLI config: build, budgets
├── vercel.json                   # Vercel build output + rewrites
├── tailwind.config.js            # Tailwind v3 config
├── tsconfig.json                 # TypeScript base config
├── BILLING_SETUP.md              # Razorpay setup guide
├── VOICE_AGENT_SETUP.md          # Vapi.ai setup guide
└── ARCHITECTURE.md               # This file
```

---

## 4. Frontend — Angular Application

### Framework & Patterns

| Concern | Approach |
|---------|----------|
| Components | All standalone — no NgModules anywhere |
| State | Angular Signals (`signal`, `computed`) — no NgRx, no BehaviorSubject |
| Change Detection | `ChangeDetectionStrategy.OnPush` on every component |
| Forms | Reactive Forms (`FormBuilder`, `FormGroup`, `FormArray`) |
| Routing | Lazy-loaded via `loadComponent` / `loadChildren` |
| Styling | Tailwind CSS v3 utility classes only — no custom CSS except `safe-bottom` inset |
| HTTP | Native `fetch()` — no HttpClient (not needed at this scale) |

### Application Bootstrap (`app.config.ts`)

```
bootstrapApplication(AppComponent)
  └── appConfig
      ├── provideRouter(routes, withInMemoryScrolling)
      ├── provideZoneChangeDetection({ eventCoalescing: true })
      └── APP_INITIALIZER → ClinicConfigService.loadFromFirestore()
          (blocks first render until clinic data is ready)
```

`APP_INITIALIZER` is the critical path. Before any component renders, the service:
1. Reads `window.location.hostname`
2. On `localhost` — skips Firestore, uses empty fallback config
3. On production — queries Firestore for a clinic matching `domain` or `vercelDomain`
4. If found and subscription is valid → sets the clinic config signal
5. If expired/cancelled/not found → leaves `isLoaded = false` → guard redirects to `/business`

### Component Communication

All components are loosely coupled through injected services. No component-to-component `@Input`/`@Output` chains beyond simple presentational components (`service-card`, `testimonial-card`, `section-header`).

```
ClinicConfigService (singleton)
  ↑ inject
  ├── All clinic-facing pages (home, services, about, etc.)
  ├── ClinicLayoutComponent
  ├── NavbarComponent
  ├── FooterComponent
  └── AppointmentService (for clinicId scoping)
```

### Subscription Cleanup

`ClinicFormComponent` is the only component that creates RxJS subscriptions (5 `valueChanges` subscriptions for form auto-fills). These are collected in a `Subscription` bag and unsubscribed in `ngOnDestroy`. All other components use signals only.

---

## 5. Backend — Vercel Serverless Functions

All functions live in `api/` and are TypeScript compiled by Vercel at deploy time using `@vercel/node`.

### `api/create-subscription.ts`

**Trigger:** `POST /api/create-subscription` — called from `BillingService` in the browser  
**Purpose:** Create a Razorpay recurring subscription; return the hosted payment page URL  
**Auth:** None (called only from the authenticated super admin UI)

```
Request:  { clinicId, plan: 'starter'|'pro', clinicName, phone? }
Response: { subscriptionId, shortUrl }

Flow:
  1. Validate plan exists in PLAN_IDS (env vars)
  2. Call Razorpay subscriptions.create()
  3. Return shortUrl — clinic owner opens this, pays once, auto-charged forever after
```

**Env vars used:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_PRO`

---

### `api/razorpay-webhook.ts`

**Trigger:** `POST /api/razorpay-webhook` — called by Razorpay servers on billing events  
**Purpose:** Keep Firestore `clinics` doc subscription status in sync automatically  
**Auth:** HMAC-SHA256 signature verification (`x-razorpay-signature` header)

```
Events handled:
  subscription.activated / charged → active: true, subscriptionStatus: 'active'
  subscription.pending             → no change (grace period)
  subscription.halted              → active: false, subscriptionStatus: 'expired'
  subscription.cancelled           → active: false, subscriptionStatus: 'cancelled'
  subscription.resumed             → active: true,  subscriptionStatus: 'active'

clinicId is extracted from subscription.notes (set at creation time)
```

**Env vars used:** `RAZORPAY_WEBHOOK_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

---

### `api/vapi-create-assistant.ts`

**Trigger:** `POST /api/vapi-create-assistant` — called from clinic-list UI (super admin)  
**Purpose:** Create a per-clinic Vapi AI assistant with a Hinglish system prompt; save the ID to Firestore  
**Auth:** None (called only from the authenticated super admin UI)

```
Request:  { clinicId, name, city, addressLine1, phone, doctorName,
            doctorQualification, hours[], services[] }
Response: { assistantId }

Flow:
  1. Build a Hinglish system prompt with the clinic's actual data
  2. POST to https://api.vapi.ai/assistant
     - model: openai/gpt-4o-mini
     - voice: openai/nova
     - serverUrl: APP_BASE_URL/api/vapi-webhook
  3. On success: db.collection('clinics').doc(clinicId).update({ vapiAssistantId, vapiPublicKey })
  4. Return assistantId
```

**Env vars used:** `VAPI_API_KEY`, `VAPI_PUBLIC_KEY`, `APP_BASE_URL`, `VAPI_WEBHOOK_SECRET`, Firebase vars

---

### `api/vapi-webhook.ts`

**Trigger:** `POST /api/vapi-webhook` — called by Vapi at end of each AI phone/web call  
**Purpose:** Extract appointment details from the call transcript and create a Firestore appointment  
**Auth:** `x-vapi-secret` header check

```
Flow:
  1. Verify x-vapi-secret header
  2. Only process event type: end-of-call-report or call-end
  3. Extract from transcript via regex:
     - Patient name  (Hindi + English patterns)
     - Phone number  (Indian 10-digit)
     - Service       (dental terms)
     - Date + time   (natural language)
  4. If name or phone found → create appointments doc:
     { clinicId, bookingRef: 'VOICE-xxx', source: 'voice', status: 'pending' }
  5. Return 200 always (prevents Vapi retries on Firestore failure)
```

**Env vars used:** `VAPI_WEBHOOK_SECRET`, Firebase vars

---

## 6. Database — Firebase Firestore

### Collections

#### `clinics`
Primary collection. One document per deployed clinic.

```typescript
{
  // Identity
  name:                string;
  doctorName:          string;
  doctorQualification: string;
  doctorUniversity:    string;
  doctorBio:           string[];
  patientCount:        string;

  // Contact
  phone:           string;
  phoneE164:       string;
  whatsappNumber:  string;
  addressLine1:    string;
  addressLine2:    string;
  city:            string;
  mapEmbedUrl:     string;
  mapDirectionsUrl:string;

  // Routing
  domain?:         string;   // Custom domain — primary lookup key
  vercelDomain?:   string;   // Vercel domain — fallback lookup key
  active:          boolean;  // false = site blocked for patients

  // Subscription
  subscriptionPlan:   'trial' | 'starter' | 'pro';
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled';
  trialEndDate?:      string;  // ISO date
  subscriptionEndDate?:string; // ISO date
  billingCycle?:      'monthly' | 'yearly';
  lastPaymentDate?:   string;
  lastPaymentAmount?: number;
  lastPaymentRef?:    string;
  razorpaySubscriptionId?: string;
  billingEmail?:      string;
  billingNotes?:      string;

  // Voice Agent
  vapiAssistantId?: string;
  vapiPublicKey?:   string;

  // Brand
  theme:            'blue' | 'teal' | 'caramel';
  bookingRefPrefix: string;  // e.g. "SD" → booking refs like "SD-A1B2C3D4"
  googlePlaceId?:   string;

  // Content
  social:       { facebook?, instagram?, linkedin? };
  hours:        { days: string; time: string }[];
  services:     { iconPath, name, description, benefit, price }[];
  plans:        { tag, name, subtitle, price, period, highlighted, features[] }[];
  testimonials: { name, location, rating, review }[];

  createdAt: Timestamp;
}
```

**Indexes needed:**
- `domain ASC + active ASC` (composite) — for domain lookup
- `vercelDomain ASC + active ASC` (composite) — for vercelDomain lookup
- `createdAt DESC` (single field) — for `getAll()`
- `subscriptionStatus ASC + trialEndDate ASC` (composite) — for `getExpiredTrials()`

---

#### `appointments`
One document per appointment across all clinics. `clinicId` field scopes each appointment.

```typescript
{
  clinicId:   string;   // Firestore doc ID of the clinic
  bookingRef: string;   // e.g. "SD-A1B2C3D4" or "VOICE-1A2B3C"
  name:       string;
  phone:      string;
  email?:     string;
  service:    string;
  date:       string;   // "YYYY-MM-DD"
  time:       string;   // e.g. "Morning (9am - 12pm)"
  message?:   string;
  status:     'pending' | 'confirmed' | 'cancelled';
  source?:    'voice';  // only set for Vapi bookings
  createdAt:  Timestamp;
}
```

**Indexes needed:**
- `clinicId ASC + createdAt DESC` (composite) — for `getAllAppointments()` per clinic
- `clinicId ASC + bookingRef ASC + phone ASC` (composite) — for `getAppointmentByRef()`

---

#### `leads`
CRM pipeline for prospecting new clinics.

```typescript
{
  clinicName:    string;
  doctorName:    string;
  phone:         string;
  city:          string;
  source:        'google_maps' | 'instagram' | 'referral' | 'ida' | 'walkin' | 'other';
  status:        'new' | 'contacted' | 'interested' | 'demo' | 'converted' | 'lost';
  followUpDate?: string;
  notes?:        string;
  referredBy?:   string;
  createdAt:     Timestamp;
}
```

Sub-collection: `leads/{id}/activities`
```typescript
{
  type:      'whatsapp' | 'called' | 'note' | 'status_change';
  note:      string;
  createdAt: Timestamp;
}
```

---

#### `superAdmins`
One document per super admin user. Document ID = Firebase Auth UID.
```typescript
{ /* doc just needs to exist — presence = authorization */ }
```

---

#### `platform`
Single document `platform/settings` for cost tracking.
```typescript
{
  monthlyCosts: {
    vercel:   number;
    firebase: number;
    domain:   number;
    other:    number;
  }
}
```

---

## 7. Authentication

### Clinic Admin Auth (`AuthService`)
- Firebase Email/Password Auth
- Scoped to the clinic's own domain
- `onAuthStateChanged` restores session on page refresh
- Guards `/admin` and `/admin/settings` routes

```
Login flow:
  /admin/login → signInWithEmailAndPassword()
  → if success → navigate to /admin
  → if fail → show error message

Logout:
  /admin → logout button → signOut() → navigate to /admin/login
```

### Super Admin Auth (`SuperAuthService`)
- Firebase Email/Password Auth
- Additional Firestore check: `superAdmins/{uid}` doc must exist
- If the doc doesn't exist → sign out immediately → throw "Not authorised"
- `authReady` Promise gates the super-admin guard on page refresh

```
Login flow:
  /business/login → signInWithEmailAndPassword()
  → getDoc(superAdmins/{uid}) → if not exists → signOut() + throw
  → if exists → navigate to /business/clinics

Guard on refresh:
  await auth.authReady  (waits for Firebase to restore session)
  → if isLoggedIn → allow
  → else → redirect to /business/login
```

---

## 8. Multi-Tenancy Model

### Domain Resolution

Every page load triggers `ClinicConfigService.loadFromFirestore()` via `APP_INITIALIZER`:

```
hostname = window.location.hostname

if (localhost) → use empty fallback config, isLoaded = true

else:
  query clinics WHERE domain == hostname AND active == true LIMIT 1
  if found → use this clinic
  
  else:
    query clinics WHERE vercelDomain == hostname AND active == true LIMIT 1
    if found → use this clinic
    
    else:
      isLoaded stays false
      clinicRequiredGuard redirects to /business
```

### Subscription Gating

After loading the clinic doc, the service checks if the subscription is still valid:

```
Grace period = 3 days after expiry date

Blocked if ANY of:
  subscriptionStatus === 'expired'
  subscriptionStatus === 'cancelled'
  subscriptionStatus === 'trial' AND trialEndDate + 3 days < today
  subscriptionStatus === 'active' AND subscriptionEndDate + 3 days < today

If blocked → isLoaded stays false → clinicRequiredGuard → /business
```

### Data Isolation

Every appointment is tagged with `clinicId` (the Firestore doc ID of the clinic).  
`AppointmentService.clinicId` getter returns `config.clinicId ?? config.bookingRefPrefix`.  
All Firestore queries include `where('clinicId', '==', this.clinicId)`.  
There is no way for clinic A to see clinic B's appointments from the client.

---

## 9. Routing & Guards

### Route Map

```
/                          → HomeComponent           [clinicRequired]
/services                  → ServicesComponent        [clinicRequired]
/about                     → AboutComponent           [clinicRequired]
/appointment               → AppointmentComponent     [clinicRequired]
/appointment/confirmed     → ConfirmedComponent       [clinicRequired]
/my-appointment            → MyAppointmentComponent   [clinicRequired]
/gallery                   → GalleryComponent         [clinicRequired]
/testimonials              → TestimonialsComponent    [clinicRequired]
/contact                   → ContactComponent         [clinicRequired]
/admin/login               → AdminLoginComponent      [clinicRequired]
/admin                     → AdminDashboardComponent  [clinicRequired + admin]
/admin/settings            → AdminSettingsComponent   [clinicRequired + admin]

/business                  → PlatformLandingComponent (public)
/business/login            → BusinessLoginComponent   (public)
/business/clinics          → ClinicListComponent      [superAdmin]
/business/clinics/new      → ClinicFormComponent      [superAdmin]
/business/clinics/:id/edit → ClinicFormComponent      [superAdmin]
/business/revenue          → RevenueComponent         [superAdmin]
/business/analytics        → AnalyticsComponent       [superAdmin]
/business/leads            → LeadListComponent        [superAdmin]
/business/leads/discover   → LeadDiscoverComponent    [superAdmin]
/business/leads/new        → LeadFormComponent        [superAdmin]
/business/leads/:id/edit   → LeadFormComponent        [superAdmin]

**                         → NotFoundComponent
```

### Guards

| Guard | File | Logic |
|-------|------|-------|
| `clinicRequiredGuard` | `clinic-required.guard.ts` | Returns `false` (→ `/business`) if `ClinicConfigService.isLoaded === false` |
| `adminGuard` | `admin.guard.ts` | Returns `false` (→ `/admin/login`) if `AuthService.isLoggedIn === false` |
| `superAdminGuard` | `super-admin.guard.ts` | Awaits `authReady`, returns UrlTree (→ `/business/login`) if not logged in |

---

## 10. Services Reference

### `ClinicConfigService`
Singleton. Loaded once at startup via `APP_INITIALIZER`.  
Exposes `config: ClinicConfig` (signal-backed), `isLoaded: boolean`, `address`, `whatsappUrl()`, `bookingWhatsappUrl`.

### `AppointmentService`
Client-side Firestore CRUD for appointments.  
Methods: `bookAppointment()`, `getAppointmentByRef()`, `updateAppointment()`, `getAllAppointments()`, `setStatus()`, `cancelAppointment()`, `canCancel()`.  
All queries are scoped to `clinicId`.

### `AuthService`
Firebase Auth for clinic admins. Signals: `currentUser`, `authReady`.  
Methods: `login()`, `logout()`. Property: `isLoggedIn`.

### `SuperAuthService`
Firebase Auth + Firestore authorisation check for super admins.  
Extra step: verifies `superAdmins/{uid}` doc exists.  
Property: `authReady: Promise<void>` — used by `superAdminGuard`.

### `ClinicFirestoreService`
Super admin only. Full CRUD for `clinics` collection.  
Methods: `getAll()`, `getById()`, `getActive()`, `getByDomain()`, `getActiveSubscriptions()`, `getExpiredTrials()`, `create()`, `update()`, `remove()`, `getAllAppointments()`, `getPlatformSettings()`, `savePlatformSettings()`, `updateClinicSettings()`.

### `LeadFirestoreService`
CRM CRUD for `leads` collection and `leads/{id}/activities` sub-collection.  
Methods: `getAll()`, `getById()`, `create()`, `update()`, `remove()`, `addActivity()`, `getActivities()`.

### `BillingService`
Thin wrapper around `/api/create-subscription`.  
Methods: `createSubscription()`, `whatsappPaymentMessage()`.

### `SeoService`
Auto-updates `<title>`, meta tags, OG tags, Twitter cards, canonical URL, and JSON-LD `Dentist` schema on every route change. Reads clinic name/city/social from `ClinicConfigService`.

### `ThemeService`
Reads `config.theme` and adds `theme-blue` / `theme-teal` / `theme-caramel` class to `<html>`. Used for future per-clinic colour customisation.

---

## 11. Billing System — Razorpay

### Subscription Lifecycle

```
Super admin → clinic card → "Send Payment Link"
  ↓
BillingService.createSubscription(clinicId, plan)
  ↓
POST /api/create-subscription
  ↓
Razorpay subscriptions.create({ plan_id, total_count: 120, notes: { clinicId, plan } })
  ↓
Returns short_url → WhatsApp message pre-filled → admin sends to clinic owner
  ↓
Clinic owner clicks link → pays on Razorpay hosted page → card saved
  ↓
subscription.activated webhook → Firestore: active=true, subscriptionStatus='active'
  ↓
Every month: subscription.charged webhook → Firestore: lastPaymentAt updated
  ↓
If payment fails: subscription.halted → Firestore: active=false, subscriptionStatus='expired'
  ↓
Clinic site shows payment expired page (clinicRequiredGuard blocks access)
```

### Plan IDs

Plans must be created manually in the Razorpay Dashboard first:
- Starter: ₹399/mo recurring → `RAZORPAY_PLAN_STARTER` env var
- Pro: ₹699/mo recurring → `RAZORPAY_PLAN_PRO` env var

See `BILLING_SETUP.md` for full setup steps.

---

## 12. AI Voice Agent — Vapi.ai

### Architecture

Each clinic gets its **own Vapi assistant** with the clinic's data baked into the system prompt. This enables:
- Correct clinic-specific answers (hours, services, pricing, address)
- Hinglish conversation in the clinic's name
- Independent phone number assignment per clinic

### Assistant Creation

```
Super admin → clinic card → "Create Voice Agent"
  ↓
POST /api/vapi-create-assistant { clinicId, name, city, hours, services, ... }
  ↓
Build Hinglish system prompt (doctor name, address, services, booking flow)
  ↓
POST https://api.vapi.ai/assistant
  {
    model: { provider: 'openai', model: 'gpt-4o-mini' },
    voice: { provider: 'openai', voiceId: 'nova' },
    firstMessage: "Namaste! [clinic] mein aapka swagat hai...",
    serverUrl: APP_BASE_URL/api/vapi-webhook
  }
  ↓
db.clinics.doc(clinicId).update({ vapiAssistantId, vapiPublicKey })
  ↓
Clinic card shows "Voice Agent Active" badge
```

### Website Widget

When a clinic loads in the browser, `ClinicLayoutComponent.ngOnInit()` checks:

```typescript
if (cfg.vapiAssistantId && cfg.vapiPublicKey) {
  startVapiWidget(cfg.vapiPublicKey, cfg.vapiAssistantId);
}
```

`startVapiWidget()` in `core/utils/vapi-widget.ts`:
- Injects the Vapi HTML script tag SDK (singleton — only once per page lifetime)
- Renders a purple mic button at `bottom-right`, `80px` above the WhatsApp button
- Patient clicks → speaks → AI responds in Hinglish → books appointment

### End-of-Call Webhook

```
Call ends → Vapi POSTs to /api/vapi-webhook
  ↓
Verify x-vapi-secret header
  ↓
Extract from transcript:
  - name: regex for "mera naam / my name is"
  - phone: regex for 10-digit Indian mobile
  - service: dental keyword matching
  - date/time: natural language patterns
  ↓
If name or phone found:
  db.appointments.add({
    clinicId, bookingRef: 'VOICE-xxx', source: 'voice', status: 'pending'
  })
  ↓
Appointment appears in clinic admin dashboard alongside web bookings
```

See `VOICE_AGENT_SETUP.md` for full setup steps including webhook URL and phone number assignment.

---

## 13. SEO & Metadata

`SeoService` (singleton, instantiated in `AppComponent`) listens to `NavigationEnd` events and updates:

| Tag | Value |
|-----|-------|
| `<title>` | `{routeTitle} | {clinicName}` or `{clinicName} | Dental Clinic in {city}` |
| `meta[description]` | Route-specific or clinic + city default |
| `meta[robots]` | `index,follow` or `noindex,nofollow` for admin/confirmed pages |
| `og:title/description/type/url/image/site_name/locale` | Dynamic per route |
| `twitter:card/title/description/image` | Dynamic per route |
| `link[rel=canonical]` | Absolute URL of current page |
| `script[type=application/ld+json]` | JSON-LD `Dentist` schema with clinic address, phone, social |

Routes that should not be indexed use `data: { noIndex: true }` in the route config.

---

## 14. Deployment Pipeline

### Build

```bash
npm run build
# → ng build
# → Outputs to dist/sneha-dental/browser/
```

Angular build produces:
- `index.html` — SPA entry point
- Hashed JS chunks (initial + lazy-loaded per route)
- `styles-*.css` — compiled Tailwind
- Static assets (`og-default.svg`, etc.)

### Vercel Configuration (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/sneha-dental/browser",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)",    "destination": "/index.html" }
  ]
}
```

- `/api/*` routes are served by Vercel serverless functions in `api/`
- Everything else serves `index.html` (SPA catch-all)

### Deployment Trigger

Any `git push origin main` triggers an automatic Vercel deployment via GitHub integration.

### Per-Clinic Domain Setup

No new deployments needed per clinic. To add a new clinic:
1. Create clinic doc in Firestore via `/business/clinics/new`
2. Set `vercelDomain` to the desired `*.vercel.app` alias
3. In Vercel Dashboard → Domains → add the alias pointing to the same deployment
4. Optionally set a custom `domain` for the clinic and add it in Vercel too

---

## 15. Environment Variables

### Client-side (in `environment.ts` / `environment.prod.ts`)

These are bundled into the Angular JS output — **do not put secrets here**.

| Variable | Description |
|----------|-------------|
| `firebase.apiKey` | Firebase Web API key (public, safe) |
| `firebase.authDomain` | Firebase Auth domain |
| `firebase.projectId` | Firestore project ID |
| `firebase.storageBucket` | Firebase Storage bucket |
| `firebase.messagingSenderId` | Firebase messaging |
| `firebase.appId` | Firebase app ID |
| `firebase.measurementId` | Google Analytics |
| `googleMapsApiKey` | Google Maps Platform key (currently empty) |

### Server-side (Vercel Environment Variables — secrets)

Set in **Vercel Dashboard → Project → Settings → Environment Variables**.

| Variable | Used By | Description |
|----------|---------|-------------|
| `VAPI_API_KEY` | `vapi-create-assistant.ts` | Vapi private API key |
| `VAPI_PUBLIC_KEY` | `vapi-create-assistant.ts` | Vapi public key (stored in Firestore, read by browser widget) |
| `VAPI_WEBHOOK_SECRET` | `vapi-create-assistant.ts`, `vapi-webhook.ts` | Shared secret to verify Vapi webhook calls |
| `APP_BASE_URL` | `vapi-create-assistant.ts` | Stable production URL e.g. `https://my-dental-platform.vercel.app` |
| `RAZORPAY_KEY_ID` | `create-subscription.ts` | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | `create-subscription.ts` | Razorpay secret |
| `RAZORPAY_PLAN_STARTER` | `create-subscription.ts` | Razorpay plan ID for Starter (₹399/mo) |
| `RAZORPAY_PLAN_PRO` | `create-subscription.ts` | Razorpay plan ID for Pro (₹699/mo) |
| `RAZORPAY_WEBHOOK_SECRET` | `razorpay-webhook.ts` | HMAC secret to verify Razorpay webhooks |
| `FIREBASE_PROJECT_ID` | All `api/*.ts` | Firebase Admin project ID |
| `FIREBASE_CLIENT_EMAIL` | All `api/*.ts` | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | All `api/*.ts` | Firebase Admin private key (paste with `\n` as literal chars) |

---

## 16. Data Flow Diagrams

### Patient Books an Appointment

```
Patient visits clinic website
  ↓
APP_INITIALIZER: ClinicConfigService.loadFromFirestore()
  → Firestore query: clinics WHERE vercelDomain == hostname
  → Sets clinic config signal
  ↓
NavbarComponent, FooterComponent, all pages render with clinic data
  ↓
Patient navigates to /appointment
  → AppointmentComponent renders with clinic's services list
  ↓
Patient fills form → submits
  ↓
AppointmentService.bookAppointment()
  → Firestore: appointments.add({ clinicId, bookingRef: 'SD-XXXXXX', status: 'pending' })
  ↓
Router navigates to /appointment/confirmed?ref=SD-XXXXXX
  ↓
Clinic admin sees new appointment in /admin dashboard
  → can Confirm (WhatsApp notification button) or Cancel
```

### Clinic Admin Cancels an Appointment

```
Admin clicks "Cancel" on appointment card
  ↓
confirmCancelId signal set (inline confirm: "Cancel? Yes / No")
  ↓
Admin clicks "Yes"
  ↓
AppointmentService.setStatus(id, 'cancelled')
  → Firestore: appointments.doc(id).update({ status: 'cancelled' })
  ↓
appointments signal updated locally (no re-fetch needed)
  ↓
Card UI updates to show "Cancelled" badge
```

### Voice Call Booking

```
Patient calls clinic number (forwarded to Vapi phone number)
  OR patient clicks mic button on clinic website
  ↓
Vapi AI answers (GPT-4o-mini, nova voice)
  → Greets in Hindi: "Namaste! [Clinic] mein aapka swagat hai..."
  → Collects: name, phone, preferred date/time, service
  → Says: "Main aapka appointment book kar rahi hoon..."
  ↓
Call ends → Vapi POSTs to /api/vapi-webhook
  ↓
Transcript analysis: regex extracts name, phone, service, date, time
  ↓
Firestore: appointments.add({
  clinicId, bookingRef: 'VOICE-xxx', source: 'voice', status: 'pending'
})
  ↓
Appointment appears in /admin dashboard with "Voice" tag
```

---

## 17. Security Model

### Client-Side Firestore Access
Firestore Security Rules should enforce:
- `clinics` collection: read = anyone (needed for domain resolution); write = authenticated super admin only
- `appointments` collection: read/write = authenticated clinic admin or authenticated super admin
- `leads` collection: read/write = authenticated super admin only
- `superAdmins` collection: read = authenticated user (for auth check); write = admin console only

### Server-Side (Firebase Admin SDK)
All `api/*.ts` functions use `firebase-admin` with a service account, bypassing Firestore Security Rules entirely. These functions are trusted server-side code.

### API Endpoint Security
| Endpoint | Protection |
|----------|------------|
| `/api/create-subscription` | None (only reachable from super admin UI) |
| `/api/vapi-create-assistant` | None (only reachable from super admin UI) |
| `/api/razorpay-webhook` | HMAC-SHA256 signature verification |
| `/api/vapi-webhook` | `x-vapi-secret` header check |

### Firebase API Key
The Firebase client API key in `environment.ts` is intentionally public. Firebase security depends on **Firestore Security Rules** and **Auth**, not on hiding the API key.

### Sensitive Data
- No payment card data ever touches this codebase (Razorpay handles all PCI DSS)
- Patient phone numbers are stored in Firestore (consider DPDP Act compliance for Indian deployments)
- Firebase Admin private key is a Vercel secret — never committed to git

---

## 18. Known Limitations & Future Work

### Currently Not Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| Firestore composite indexes | Manual setup required | Firebase Console → Indexes. Will auto-prompt with link on first query failure |
| Google Maps API key | Empty in environment | Populate `googleMapsApiKey` to enable Lead Discovery and auto-fill map URLs |
| `APP_BASE_URL` env var | Needs to be set in Vercel | Prevents Vapi webhooks using unstable per-deployment URL |
| Vapi phone number | Optional | Buy in Vapi Dashboard → assign to assistant for actual phone receptionist |
| Email notifications | Not built | Could add Firebase Functions or Resend API for booking confirmation emails |
| Multi-branch clinics | Not supported | Pro plan claims support — needs separate Firestore doc per branch |
| Pagination | Not implemented | `getAll()` loads entire collection — add `startAfter` cursor when collections > 500 docs |
| Unit tests | Skeleton only | `ng test` works but no meaningful tests written |
| Image uploads | Not built | Clinic gallery uses placeholder URLs — could add Firebase Storage |

### Architecture Decisions Made

| Decision | Rationale |
|----------|-----------|
| Single deployment, multi-tenant via Firestore | Simplest ops — no per-clinic Vercel projects |
| `APP_INITIALIZER` for config loading | Guarantees clinic data is ready before any component renders — no loading flicker |
| Signals over NgRx | Sufficient for this scale; simpler mental model |
| Native `fetch()` over HttpClient | No interceptors needed; avoids adding HttpClient to providers |
| Firebase Admin in serverless functions | Client SDK can't write to Firestore without authenticated session; Admin SDK bypasses this for trusted server operations |
| Per-clinic Vapi assistants | Enables clinic-specific knowledge in the AI without RAG complexity |
| Razorpay Subscriptions (not orders) | Auto-billing removes all manual collection work |
