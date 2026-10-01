create table booking_mobile_verifications (
    token_hash varchar(128) primary key,
    phone varchar(16) not null,
    expires_at timestamptz not null,
    consumed_at timestamptz
);
alter table booking_mobile_verifications enable row level security;
revoke all on booking_mobile_verifications from public;
