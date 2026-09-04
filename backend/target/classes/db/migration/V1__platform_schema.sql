create extension if not exists pgcrypto;

create type user_role as enum ('clinic_admin', 'platform_admin', 'patient');
create type appointment_status as enum ('pending', 'confirmed', 'checked_in', 'completed', 'no_show', 'cancelled', 'declined', 'expired');
create type review_status as enum ('pending', 'published', 'rejected');

create table clinics (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    name varchar(160) not null,
    active boolean not null default true,
    marketplace_status varchar(24) not null default 'unlisted',
    marketplace_slug varchar(160) unique,
    subscription_plan varchar(24) not null default 'trial',
    subscription_status varchar(24) not null default 'trial',
    public_config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint clinics_marketplace_status_check check (marketplace_status in ('unlisted', 'pending', 'verified', 'suspended'))
);

create table users (
    id uuid primary key default gen_random_uuid(),
    firebase_uid varchar(128) unique,
    clinic_id uuid references clinics(id) on delete restrict,
    role user_role not null,
    email varchar(254),
    phone_e164 varchar(20),
    password_hash varchar(100),
    email_verified boolean not null default false,
    phone_verified boolean not null default false,
    enabled boolean not null default true,
    password_migration_required boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint users_identity_check check (email is not null or phone_e164 is not null),
    constraint users_email_unique unique nulls not distinct (email),
    constraint users_phone_unique unique nulls not distinct (phone_e164),
    constraint users_tenant_role_check check (
        (role = 'clinic_admin' and clinic_id is not null) or
        (role <> 'clinic_admin' and clinic_id is null)
    )
);

create table refresh_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    token_hash char(64) not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    replaced_by uuid references refresh_tokens(id) on delete set null,
    user_agent varchar(500),
    ip_hash char(64),
    created_at timestamptz not null default now()
);

create table auth_challenges (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    purpose varchar(32) not null,
    destination varchar(254) not null,
    secret_hash varchar(100) not null,
    attempts smallint not null default 0,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now(),
    constraint auth_challenges_purpose_check check (purpose in ('phone_otp', 'verify_email', 'password_reset'))
);

create table clinic_private_accounts (
    clinic_id uuid primary key references clinics(id) on delete restrict,
    billing_email varchar(254),
    razorpay_customer_id varchar(128),
    razorpay_subscription_id varchar(128),
    billing_config jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table doctors (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128),
    clinic_id uuid not null references clinics(id) on delete restrict,
    name varchar(160) not null,
    qualification varchar(160),
    speciality varchar(160),
    available boolean not null default true,
    schedule jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (clinic_id, firestore_id)
);

create table appointments (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    clinic_id uuid not null references clinics(id) on delete restrict,
    patient_id uuid references users(id) on delete restrict,
    doctor_id uuid references doctors(id) on delete restrict,
    booking_ref varchar(32) not null,
    patient_name varchar(120) not null,
    phone_e164 varchar(20) not null,
    email varchar(254),
    service varchar(160) not null,
    appointment_date date not null,
    appointment_time time not null,
    status appointment_status not null default 'pending',
    source varchar(24) not null,
    message varchar(2000),
    cancellation_reason varchar(500),
    cancellation_actor varchar(24),
    clinic_notes text,
    treatment_done text,
    amount_charged numeric(12,2),
    payment_status varchar(24),
    payment_method varchar(24),
    confirmation_deadline timestamptz,
    confirmation_responded_at timestamptz,
    confirmed_at timestamptz,
    declined_at timestamptz,
    expired_at timestamptz,
    consent_version varchar(20),
    consent_at timestamptz,
    attribution jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (clinic_id, booking_ref),
    constraint appointments_source_check check (source in ('clinic_website', 'marketplace', 'voice'))
);

create table appointment_slots (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references clinics(id) on delete restrict,
    doctor_id uuid references doctors(id) on delete restrict,
    appointment_id uuid not null unique references appointments(id) on delete cascade,
    appointment_date date not null,
    appointment_time time not null,
    created_at timestamptz not null default now(),
    unique nulls not distinct (clinic_id, doctor_id, appointment_date, appointment_time)
);

create table appointment_reviews (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(80) unique,
    appointment_id uuid not null unique references appointments(id) on delete restrict,
    clinic_id uuid not null references clinics(id) on delete restrict,
    patient_id uuid not null references users(id) on delete restrict,
    rating smallint not null check (rating between 1 and 5),
    review_text varchar(1200) not null default '',
    patient_alias varchar(48) not null,
    moderation_status review_status not null default 'pending',
    clinic_response varchar(600),
    clinic_responded_at timestamptz,
    published_at timestamptz,
    reviewed_by uuid references users(id) on delete restrict,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table appointment_review_reports (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(80) unique,
    review_id uuid not null references appointment_reviews(id) on delete restrict,
    reporter_id uuid not null references users(id) on delete restrict,
    reason varchar(24) not null,
    details varchar(500) not null default '',
    status varchar(24) not null default 'pending',
    reviewed_by uuid references users(id) on delete restrict,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (review_id, reporter_id),
    constraint review_reports_reason_check check (reason in ('privacy', 'abuse', 'misleading', 'other')),
    constraint review_reports_status_check check (status in ('pending', 'resolved', 'dismissed'))
);

create table leads (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    clinic_id uuid references clinics(id) on delete restrict,
    name varchar(160) not null,
    phone_e164 varchar(20),
    email varchar(254),
    status varchar(32) not null,
    source varchar(64),
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table lead_activities (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128),
    lead_id uuid not null references leads(id) on delete cascade,
    actor_id uuid references users(id) on delete set null,
    activity_type varchar(64) not null,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (lead_id, firestore_id)
);

create table contacts (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    clinic_id uuid references clinics(id) on delete restrict,
    name varchar(120) not null,
    phone varchar(24) not null,
    email varchar(254),
    message varchar(2000) not null,
    consent_version varchar(20),
    consent_at timestamptz,
    created_at timestamptz not null default now()
);

create table voice_sessions (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    clinic_id uuid not null references clinics(id) on delete restrict,
    provider_session_id varchar(160),
    status varchar(32) not null,
    duration_seconds integer not null default 0 check (duration_seconds >= 0),
    data jsonb not null default '{}'::jsonb,
    started_at timestamptz not null,
    ended_at timestamptz,
    created_at timestamptz not null default now()
);

create table subscriptions (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    clinic_id uuid not null references clinics(id) on delete restrict,
    provider varchar(32) not null default 'razorpay',
    provider_subscription_id varchar(128) unique,
    plan varchar(24) not null,
    billing_cycle varchar(16) not null,
    status varchar(32) not null,
    current_period_start timestamptz,
    current_period_end timestamptz,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table provider_verifications (
    clinic_id uuid primary key references clinics(id) on delete restrict,
    status varchar(24) not null,
    evidence jsonb not null default '{}'::jsonb,
    reviewed_by uuid references users(id) on delete restrict,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table provider_verification_events (
    id uuid primary key default gen_random_uuid(),
    firestore_id varchar(128) unique,
    clinic_id uuid not null references clinics(id) on delete restrict,
    reviewer_id uuid references users(id) on delete restrict,
    status varchar(24) not null,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table notifications (
    id uuid primary key default gen_random_uuid(),
    idempotency_key varchar(160) unique,
    clinic_id uuid references clinics(id) on delete restrict,
    appointment_id uuid references appointments(id) on delete restrict,
    notification_type varchar(64) not null,
    destination varchar(254) not null,
    status varchar(24) not null default 'pending',
    attempts smallint not null default 0,
    next_attempt_at timestamptz,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table rate_limit_buckets (
    bucket_key char(64) primary key,
    request_count integer not null default 0,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create table webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider varchar(32) not null,
    event_key varchar(160) not null,
    event_type varchar(100) not null,
    clinic_id uuid references clinics(id) on delete restrict,
    payload_hash char(64) not null,
    processed_at timestamptz not null default now(),
    unique (provider, event_key)
);

create index appointments_clinic_created_idx on appointments (clinic_id, created_at desc);
create index appointments_patient_created_idx on appointments (patient_id, created_at desc);
create index appointments_expiry_idx on appointments (source, status, confirmation_deadline);
create index reviews_clinic_published_idx on appointment_reviews (clinic_id, moderation_status, published_at desc);
create index reviews_moderation_idx on appointment_reviews (moderation_status, created_at);
create index review_reports_status_idx on appointment_review_reports (status, created_at);
create index voice_sessions_usage_idx on voice_sessions (clinic_id, started_at);
create index leads_status_created_idx on leads (status, created_at desc);
create index refresh_tokens_user_idx on refresh_tokens (user_id, expires_at);
create index auth_challenges_destination_idx on auth_challenges (destination, purpose, expires_at);