-- Performance indexes for appointments, slots, and notifications

-- Accelerates reminder scheduler and date-filtered appointment queries
create index if not exists appointments_date_status_idx on appointments (appointment_date, status);

-- Accelerates clinic-level date schedule queries and conflict lookups
create index if not exists appointments_clinic_date_idx on appointments (clinic_id, appointment_date, appointment_time);

-- Accelerates patient phone lookups and aggregation
create index if not exists appointments_clinic_phone_idx on appointments (clinic_id, phone_e164);

-- Accelerates slot reservation checks
create index if not exists appointment_slots_clinic_date_idx on appointment_slots (clinic_id, appointment_date, appointment_time);

-- Accelerates notification retry and processing queue
create index if not exists notifications_status_attempts_idx on notifications (status, attempts);
