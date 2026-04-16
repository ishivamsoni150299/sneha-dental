# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**My Dental Platform** — multi-tenant dental clinic SaaS built with Angular 19 and Tailwind CSS.

## Tech Stack

- **Angular 19** — standalone components, no NgModules
- **Tailwind CSS v3** — utility-first, mobile-first styling
- **Angular Reactive Forms** — appointment booking form
- **Angular Signals** — reactive state (`signal`, `computed`)
- **Change Detection** — `OnPush` on every component

## Commands

```bash
npm install          # install dependencies
npm start            # dev server at localhost:4200
npm run build        # production build
npm test             # run unit tests
npm run lint         # lint check

# generate a new page component
ng generate component features/<name>/<name> --standalone --style css
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
src/app/
  core/services/          # appointment.service.ts, meta.service.ts
  shared/components/      # navbar, footer, section-header, service-card, testimonial-card
  features/               # one folder per page (home, services, about, etc.)
  app.routes.ts
  app.config.ts
  app.component.ts        # shell: navbar + <router-outlet> + footer
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
