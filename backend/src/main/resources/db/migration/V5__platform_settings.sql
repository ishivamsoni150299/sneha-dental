create table platform_settings (
    setting_key varchar(80) primary key,
    value jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);