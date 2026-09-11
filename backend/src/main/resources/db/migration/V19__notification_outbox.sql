-- Transactional notification outbox for reliable delivery of appointment and review events.
create table notification_outbox (
    id uuid primary key default gen_random_uuid(),
    idempotency_key varchar(120) not null unique,
    clinic_id uuid references clinics(id) on delete set null,
    appointment_id uuid references appointments(id) on delete set null,
    notification_type varchar(64) not null,
    channel varchar(32) not null default 'email',
    destination varchar(255) not null,
    subject varchar(255) not null,
    payload jsonb not null default '{}'::jsonb,
    status varchar(32) not null default 'pending',
    attempts integer not null default 0,
    next_retry_at timestamptz not null default now(),
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index notification_outbox_queue_idx on notification_outbox (status, next_retry_at) where status in ('pending', 'failed');
