create table appointment_claim_challenges (
    id uuid primary key,
    appointment_id uuid not null references appointments(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    secret_hash varchar(255) not null,
    attempts smallint not null default 0,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
);

create index appointment_claim_challenges_rate_idx
    on appointment_claim_challenges (user_id, created_at desc);

create table appointment_claim_events (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid not null references appointments(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    event_type varchar(24) not null check (event_type in ('requested', 'claimed', 'rejected')),
    created_at timestamptz not null default now()
);
