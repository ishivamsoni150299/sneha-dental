# Clinic scheduling

## Daily workflow

- Open an appointment's details in the clinic dashboard and choose **Reschedule**.
  Select the doctor, date, and an available time. The booking reference and current
  pending/confirmed status stay the same. Tell the patient the new time; this action
  does not send an automatic notification.
- Confirm a pending request, mark a confirmed patient as arrived, then complete the
  visit. Mark **No show** from a confirmed appointment, not after the patient arrives.
  Cancelled, declined, expired, completed, and no-show appointments cannot be reopened
  by a status update.
- In **Doctors → Edit Schedule**, set weekly working hours, add breaks in chronological
  order, and add holiday/day-off dates. A complete 30-minute appointment must fit
  before closing and must not overlap a break.
- Reschedule or cancel affected upcoming appointments before shortening a schedule,
  adding a day off, or marking a doctor unavailable. Unavailable remains in effect
  until changed; it is not a one-day toggle.

## Availability and reservations

Doctor-specific clinic bookings, marketplace availability, video bookings, and
reschedules use the same schedule rules in India Standard Time. “No preference”
shows the union of doctor availability and assigns an available doctor on the server.
Clinics with no doctor profiles retain their legacy general-booking flow; configure
doctor profiles to use breaks and holiday controls.

Rescheduling locks the appointment, validates the destination doctor within the JWT's
clinic, and replaces the reservation in one transaction. The existing unique slot
constraint rejects competing reservations; a conflict rolls back the original slot
deletion. Schedule updates and bookings also lock the doctor to prevent races.

No migration or new environment variable is required. Breaks and days off are stored
in the existing doctor schedule JSON and synchronized with provider memberships.

## Verification

Backend tests cover scheduling boundaries, breaks, holidays, status transitions,
clinic isolation, conflicting slots, automatic doctor assignment, and protected
schedule edits. Frontend tests cover stale availability responses and preservation
of appointment details after rejected changes. The database startup smoke test
requires an explicitly configured test database; unit tests do not prove live
database concurrency behavior.
