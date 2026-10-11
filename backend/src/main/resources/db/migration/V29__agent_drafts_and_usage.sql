create table agent_action_drafts (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    session_family uuid not null,
    payload jsonb not null,
    status varchar(16) not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
    result jsonb,
    expires_at timestamptz not null default now() + interval '15 minutes',
    created_at timestamptz not null default now()
);
create index agent_drafts_owner on agent_action_drafts(user_id, created_at);
create index agent_drafts_expiry on agent_action_drafts(expires_at);

-- Atomic per-account quotas also apply across application instances.
create table agent_usage_windows (
    user_id uuid not null references users(id) on delete cascade,
    category varchar(16) not null,
    window_start bigint not null,
    requests integer not null,
    primary key (user_id, category, window_start)
);
