create table patient_dentist_requests (
    id uuid primary key,
    location varchar(160) not null,
    problem varchar(500) not null,
    preferred_date date not null,
    preferred_time time not null,
    patient_name varchar(160) not null,
    mobile varchar(16) not null,
    email varchar(254),
    status varchar(20) not null default 'new' check (status in ('new', 'contacted', 'closed')),
    created_at timestamptz not null default now()
);
alter table patient_dentist_requests enable row level security;
revoke all on patient_dentist_requests from public;
