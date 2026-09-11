-- Temporary slot holds to prevent concurrent double-booking during checkout.
create table appointment_slot_holds (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references clinics(id) on delete cascade,
    doctor_id uuid references doctors(id) on delete cascade,
    appointment_date date not null,
    appointment_time time not null,
    hold_token varchar(64) not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique nulls not distinct (clinic_id, doctor_id, appointment_date, appointment_time)
);

create index appointment_slot_holds_expiry_idx on appointment_slot_holds (expires_at);
create index appointment_slot_holds_lookup_idx on appointment_slot_holds (clinic_id, appointment_date, appointment_time);
