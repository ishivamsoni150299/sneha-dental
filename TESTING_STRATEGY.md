# Testing Strategy — Sneha Dental

**Date:** 2026-04-12  
**Stack:** Angular 19 · Jasmine/Karma · Firebase/Firestore · Razorpay  
**Current test coverage:** 0% (no `.spec.ts` files exist)  
**Test runner:** `npm test` (Karma + Jasmine, already installed)

---

## Overview

This document defines the testing strategy for Sneha Dental — a multi-tenant dental clinic SaaS with Firebase backend, clinic-scoped data, subscription billing, and multi-role authentication. The goal is to establish a reliable, fast, and maintainable test suite that protects business-critical flows without over-engineering trivial UI.

---

## Testing Pyramid

```
              ┌───────────────┐
              │    E2E Tests  │  ~5%   (Playwright/Cypress — future phase)
              └───────┬───────┘
          ┌───────────┴───────────┐
          │  Integration Tests    │  ~20%  (Component + service wiring)
          └───────────┬───────────┘
    ┌──────────────────┴──────────────────┐
    │           Unit Tests                │  ~75%  (Services, guards, utilities)
    └─────────────────────────────────────┘
```

**Immediate focus:** Unit tests for services and guards (highest ROI, zero dependencies on DOM).  
**Phase 2:** Integration/component tests for high-interaction components.  
**Phase 3:** E2E tests for the three critical user journeys.

---

## Coverage Targets

| Layer | Target | Rationale |
|-------|--------|-----------|
| Core services (auth, appointment, billing) | **90%** | Business-critical, complex logic |
| Guards | **100%** | Security — must not regress |
| Shared components | **70%** | Reused everywhere, high blast radius |
| Feature components | **50%** | UI-heavy, diminishing returns beyond this |
| Utilities / helpers | **95%** | Pure functions, cheap to test |
| **Overall project** | **≥65%** | Pragmatic floor for a production app |

---

## Area-by-Area Test Plan

---

### 1. Guards (Start here — highest security value)

#### `admin.guard.ts`
**Type:** Unit  
**What to test:**
- Returns `true` when `auth.isLoggedIn` is `true`
- Redirects to `/admin/login` when not logged in
- Returns `UrlTree` (not `false`) so redirect works with the router

**Example:**
```typescript
it('should redirect to /admin/login when not logged in', () => {
  authService.isLoggedIn = false;
  const result = guard.canActivate(mockRoute, mockState);
  expect(result).toEqual(router.createUrlTree(['/admin/login']));
});
```

---

#### `clinic-required.guard.ts`
**Type:** Unit  
**What to test:**
- Redirects to `/business` when `clinic.isLoaded` is `false`
- Redirects to `/coming-soon` when `config.comingSoon` is `true`
- Passes through when clinic is loaded and not in coming-soon mode
- Edge case: `isLoaded` true but `config` is null/undefined

---

#### `super-admin.guard.ts`
**Type:** Unit  
**What to test:**
- Same pattern as `admin.guard.ts` but uses `superAuth.isSuperAdmin`
- Ensure it does not accidentally pass for regular clinic admins

---

### 2. Services (Highest business logic density)

#### `appointment.service.ts` — Priority: CRITICAL

**Type:** Unit (mock Firestore)  
**What to test:**

| Method | Test Cases |
|--------|-----------|
| `bookAppointment()` | Creates document with auto-generated `bookingRef`, sets `status: 'pending'`, uses correct `clinicId` |
| `bookAppointment()` | Throws/rejects when required fields are missing |
| `getAppointmentByRef()` | Queries by both `bookingRef` AND `phone` (clinic-scoped) |
| `getAppointmentByRef()` | Returns `null` when no match found |
| `cancelAppointment()` | Succeeds when appointment is >24 hours away |
| `cancelAppointment()` | **Throws error when appointment is ≤24 hours away** (core business rule) |
| `canCancel()` | Returns `true` for appointment 25 hours from now |
| `canCancel()` | Returns `false` for appointment 23 hours from now |
| `canCancel()` | Returns `false` for past appointments |
| `setStatus()` | Updates only the `status` field, no other fields mutated |
| `updateAppointment()` | Only allows whitelisted fields (service, date, time, message) |
| `getAllAppointments()` | Queries are scoped to `clinicId` — never cross-clinic leakage |

**Mocking approach:**
```typescript
// Mock Firestore using a simple object stub
const mockFirestore = {
  collection: jasmine.createSpy().and.returnValue({ ... }),
  doc: jasmine.createSpy().and.returnValue({ ... }),
};
```

---

#### `auth.service.ts` — Priority: HIGH

**Type:** Unit (mock Firebase Auth)  
**What to test:**

- `login()` calls Firebase `signInWithEmailAndPassword` with correct args
- `loginWithGoogle()` calls `signInWithPopup` with GoogleAuthProvider
- `logout()` calls `signOut` and clears `currentUser` signal
- `isLoggedIn` returns `true` when `currentUser` signal is non-null
- `isLoggedIn` returns `false` when `currentUser` is null
- `authReady` signal is set to `true` after Firebase `onAuthStateChanged` fires
- Error from `login()` propagates to caller (not swallowed silently)

---

#### `clinic-config.service.ts` — Priority: HIGH

**Type:** Unit (mock Firestore + mock Router)  
**What to test:**

- Loads config from custom domain first (when `window.location.hostname` is non-Vercel)
- Falls back to Vercel domain when custom domain returns empty
- Falls back to static default when both Firestore queries return empty
- Sets `isLoaded` signal to `true` after successful load
- `address` getter returns formatted string from config fields
- `whatsappUrl()` generates correct `wa.me` URL with phone number
- `bookingWhatsappUrl` getter includes pre-filled message text
- Detects expired subscription and sets correct flag
- Detects grace period correctly (e.g., 3 days past expiry = in grace)
- Redirects to `/coming-soon` when `comingSoon: true` in loaded config
- `updateConfig()` writes only to the correct clinic document

---

#### `billing.service.ts` — Priority: MEDIUM

**Type:** Unit (mock HTTP client)  
**What to test:**

- `createSubscription()` sends correct payload to Razorpay API endpoint
- `createSubscription()` returns subscription object with `id` and `short_url`
- `createSubscription()` throws on network error
- `whatsappPaymentMessage()` returns a string containing the payment link
- `whatsappPaymentMessage()` includes clinic name in the message

---

#### `clinic-firestore.service.ts` — Priority: MEDIUM

**Type:** Unit (mock Firestore)  
**What to test:**

- `getAll()` returns array of clinic objects
- `getActive()` filters only clinics with `active: true`
- `getByDomain()` queries by domain field, not by ID
- `getActiveSubscriptions()` returns only non-expired entries
- `getExpiredTrials()` returns only expired trial entries
- `updateClinicSettings()` respects the whitelist — rejects non-whitelisted keys
- `create()` stores full clinic object with generated ID
- `remove()` deletes the correct document (no accidental bulk delete)
- `getAllAppointments()` (cross-clinic) — verify this is only callable by super admin context

---

### 3. Shared Components (High reuse = high blast radius)

#### `service-card.component.ts`
**Type:** Component (TestBed)  
**What to test:**
- Renders `title` input binding correctly
- Renders `description` input binding correctly
- Emits `bookClick` output when CTA button is clicked
- Renders benefit lines if provided as input

#### `testimonial-card.component.ts`
**Type:** Component  
**What to test:**
- Renders star rating correctly (1–5)
- Renders reviewer name and text
- Handles missing/empty fields gracefully (no crash)

#### `navbar.component.ts`
**Type:** Component  
**What to test:**
- Mobile menu toggles open/closed on hamburger click
- Active route link has highlighted style (check `routerLinkActive`)
- "Book Appointment" CTA link points to `/appointment`
- WhatsApp button renders with correct href from `clinicConfigService.whatsappUrl()`

#### `section-header.component.ts`
**Type:** Component  
**What to test:**
- Renders `title` and `subtitle` inputs
- Applies correct heading level (`h2` by default)

---

### 4. Feature Components (Focus on interaction-heavy ones)

#### `appointment.component.ts` — Priority: HIGH
**Type:** Component + Reactive Forms  
**What to test:**
- Form is invalid when required fields are empty
- Form is invalid with malformed email (`not-an-email`)
- Form is invalid with short phone number (<10 digits)
- Form is valid with all correct fields
- On valid submit, `appointmentService.bookAppointment()` is called once
- On success, router navigates to `/appointment/confirmed`
- On error, error message is displayed (not a blank screen)
- Date picker does not allow past dates
- Service dropdown includes all 9 clinic services

#### `my-appointment.component.ts` — Priority: HIGH
**Type:** Component  
**What to test:**
- Lookup form queries by `bookingRef` + `phone`
- Shows appointment details after successful lookup
- Shows "not found" message when no match
- "Cancel" button is hidden when `canCancel()` returns `false`
- "Cancel" button is visible and functional when `canCancel()` returns `true`
- Edit form pre-fills with existing appointment values
- On edit save, only whitelisted fields are submitted

#### `admin-dashboard.component.ts` — Priority: MEDIUM
**Type:** Component  
**What to test:**
- Appointment list renders all items from service
- Status filter (pending/confirmed/cancelled) filters list correctly
- Status update calls `appointmentService.setStatus()` with correct args
- Search/filter input narrows displayed appointments
- Date range filter shows only appointments in range

---

### 5. Utilities & Directives

Any pure utility functions (date formatting, phone validation, booking ref generation) should have **100% unit test coverage** — they are pure functions with no side effects and are extremely cheap to test.

For directives in `/shared/directives`, test the DOM behavior they produce (attribute manipulation, event interception).

---

## Test Setup & Patterns

### Mocking Firebase

Firebase is the #1 testing challenge. Use a service stub pattern:

```typescript
// In test files
const mockAppointmentService = {
  bookAppointment: jasmine.createSpy('bookAppointment').and.returnValue(Promise.resolve()),
  canCancel: jasmine.createSpy('canCancel').and.returnValue(true),
};

TestBed.configureTestingModule({
  providers: [
    { provide: AppointmentService, useValue: mockAppointmentService }
  ]
});
```

**Never** import `firebase/app` or `AngularFireModule` in unit tests — always mock at the service boundary.

---

### Signal Testing Pattern

Angular signals require `TestBed.flushEffects()` or `fixture.detectChanges()` after mutations:

```typescript
it('should update isLoggedIn when user changes', () => {
  service.currentUser.set(mockUser);
  TestBed.flushEffects();
  expect(service.isLoggedIn).toBeTrue();
});
```

---

### OnPush Component Testing

All components use `ChangeDetectionStrategy.OnPush`. Always call `fixture.detectChanges()` after input changes:

```typescript
component.title = 'New Title';
fixture.detectChanges(); // required for OnPush
expect(compiled.querySelector('h2').textContent).toContain('New Title');
```

---

### Async/Firebase Testing

Use `fakeAsync` + `tick()` for Promise-based Firebase calls:

```typescript
it('should navigate after successful booking', fakeAsync(() => {
  mockService.bookAppointment.and.returnValue(Promise.resolve());
  component.onSubmit();
  tick();
  expect(mockRouter.navigate).toHaveBeenCalledWith(['/appointment/confirmed']);
}));
```

---

## What NOT to Test

- Angular framework internals (routing module, HttpClient itself)
- Tailwind CSS class rendering (not functional logic)
- Trivial getters that simply return a stored value
- Firebase SDK internals (trust the SDK, mock at the boundary)
- Placehold.co image loading
- `console.log` / `console.error` calls

---

## Implementation Roadmap

### Phase 1 — Foundation (Week 1–2)
Write tests for all 3 guards and core services (`auth`, `appointment`). These are the highest-risk, lowest-effort wins.

1. `admin.guard.spec.ts`
2. `clinic-required.guard.spec.ts`
3. `super-admin.guard.spec.ts`
4. `auth.service.spec.ts`
5. `appointment.service.spec.ts` ← most test cases, highest business value

### Phase 2 — Services & Shared Components (Week 3–4)
6. `clinic-config.service.spec.ts`
7. `billing.service.spec.ts`
8. `clinic-firestore.service.spec.ts`
9. `service-card.component.spec.ts`
10. `testimonial-card.component.spec.ts`
11. `navbar.component.spec.ts`

### Phase 3 — Feature Components (Week 5–6)
12. `appointment.component.spec.ts`
13. `my-appointment.component.spec.ts`
14. `admin-dashboard.component.spec.ts`
15. Remaining feature components as time permits

### Phase 4 — E2E (Future)
Set up Playwright (preferred over Cypress for Angular 19) for three journeys:
- Patient: Browse → Book Appointment → View Confirmation
- Patient: Look up appointment → Cancel appointment
- Admin: Login → View dashboard → Update appointment status

---

## Enabling Coverage Reports

Add to `angular.json` under `test > options`:

```json
"codeCoverage": true,
"codeCoverageExclude": [
  "src/environments/**",
  "src/main.ts"
]
```

Then run: `npm test -- --watch=false --browsers=ChromeHeadless`

Coverage report will be generated at `coverage/sneha-dental/index.html`.

---

## Quick Start: First Test File

To verify the test setup works before writing all specs, create this minimal smoke test:

```typescript
// src/app/core/guards/admin.guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AdminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let mockAuth: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    mockAuth = jasmine.createSpyObj('AuthService', [], { isLoggedIn: false });
    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree', 'navigate']);

    TestBed.configureTestingModule({
      providers: [
        AdminGuard,
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });
    guard = TestBed.inject(AdminGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
```

Run `npm test` — if this passes, the test infrastructure is confirmed working.
