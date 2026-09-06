# AGENTS.md

This file provides guidance to AI coding assistants (Codex, Claude Code, Antigravity) when working with code in this repository.

## Project

**My Dental Platform** — multi-tenant dental clinic SaaS built with Angular 19 frontend and Spring Boot 3 (Java 25) backend on PostgreSQL.

## Tech Stack

- **Angular 19** — standalone components, no NgModules, Angular Signals (`signal`, `computed`), `OnPush` change detection
- **Tailwind CSS v3** — utility-first, mobile-first styling with tenant CSS variables (`--accent`, `--accent-dk`, `--accent-lt`)
- **Spring Boot 3.4+ / Java 25** — monolith with virtual threads (`spring.threads.virtual.enabled=true`)
- **PostgreSQL & Flyway** — managed schema migrations (`backend/src/main/resources/db/migration/`)
- **Security** — JWT Bearer tokens, HttpOnly secure refresh cookies, Argon2id password hashing, sliding-window rate limiting
- **Background Tasks** — Resend email notification service with idempotency tracking; daily appointment reminder scheduler

## Commands

```bash
# Frontend
npm install          # install dependencies
npm start            # dev server at localhost:4200 (proxies /api to 8080)
npm run build        # production build
npm test             # run unit tests
npm run lint         # lint check

# Backend
cd backend
mvn spring-boot:run  # run Spring Boot server (port 8080)
mvn clean test       # run backend tests
mvn clean package    # build backend JAR

# Full-Stack Docker
docker build -t mydentalplatform .
```

## Color Palette

All colors use Tailwind utility classes only — no raw hex in templates.

| Role | Token |
|---|---|
| Primary | `blue-600` |
| Primary Hover | `blue-700` |
| Accent | `blue-100` |
| Background | `gray-50` |
| Text | `gray-900` |
| Muted Text | `gray-500` |

## Pages & Routes

All routes lazy-loaded via `loadComponent` in `app.routes.ts`.

| Route | Page |
|---|---|
| `/` | Home |
| `/services` | Services |
| `/about` | About Us |
| `/appointment` | Book Appointment |
| `/gallery` | Gallery |
| `/testimonials` | Testimonials |
| `/contact` | Contact |

## Project Structure

```
├── backend/                      # Spring Boot 3 / Java 25 monolith
│   ├── src/main/java/com/mydentalplatform/
│   │   ├── appointment/          # AppointmentController, AppointmentService, ReminderScheduler
│   │   ├── auth/                 # AuthController, ClinicLoginService, TokenService
│   │   ├── billing/              # BillingController, RazorpayService
│   │   ├── clinic/               # ClinicController, ContactController, DoctorController, PatientController
│   │   ├── config/               # SecurityConfig, RateLimitingFilter, GlobalExceptionHandler
│   │   └── notification/         # NotificationService (Resend email & idempotency)
│   └── src/main/resources/db/migration/  # Flyway SQL migrations (V1 to V8)
├── src/                          # Angular 19 frontend
│   ├── app/
│   │   ├── core/services/        # appointment, clinic-api, auth-facade, clinic-config
│   │   ├── core/guards/          # clinic-admin, super-admin, clinic-feature
│   │   ├── features/admin/       # Clinic dashboard, settings, enquiries inbox
│   │   ├── features/business/    # Platform landing, signup wizard, super-admin shell
│   │   ├── features/my-appointment/ # Patient booking lookup & cancellation (<24h policy)
│   │   └── shared/components/    # navbar, footer, modals, cards
│   └── index.html
├── Dockerfile                    # Multi-stage Angular + Spring Boot production container
└── proxy.conf.json               # Local development API proxy
```

## Clinic Services

General Dentistry, Cleaning & Scaling, Tooth Fillings, Extraction, Root Canal, Cosmetic Dentistry, Teeth Whitening, Orthodontics, Dental Implants

## Homepage Sections (in order)

1. **Hero** — headline, subtext, "Book Appointment" + "Call Now" buttons, doctor image placeholder
2. **Trust Bar** — 1000+ Patients, Modern Equipment, Sterilized Tools, Experienced Dentist
3. **Services Preview** — top 6 service cards with benefit lines, "View All" CTA
4. **Why Choose Us** — 4 points: pain-free, honest advice, transparent pricing, clean clinic
5. **Testimonials** — 3 patient review cards with star rating
6. **CTA Banner** — full-width blue strip, "Book Now" button
7. **Footer** — logo, quick links, contact info

## Conversion Rules

- Every page has one primary CTA: **"Book Appointment"**
- Reuse copy: *"Book in 60 seconds"*, *"Same-day appointments available"*, *"No hidden charges"*
- Mobile: sticky bottom bar with "Book Appointment" button
- All pages: floating WhatsApp button (bottom-right, `fixed bottom-6 right-6 z-50`)

## Layout Standards

```
Container:  max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
Section:    py-16 md:py-24
Card:       bg-white rounded-2xl shadow-sm border border-gray-200 p-6
Button:     bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl
Grid:       grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```

## Assets

- Images: `https://placehold.co/` until real photos provided
- Logo: SVG tooth icon + "Sneha Dental" text until real logo provided
- Doctor photo: initials avatar placeholder
