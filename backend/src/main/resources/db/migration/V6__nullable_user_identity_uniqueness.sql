alter table users drop constraint users_email_unique;
alter table users drop constraint users_phone_unique;

create unique index users_email_unique on users (lower(email)) where email is not null;
create unique index users_phone_unique on users (phone_e164) where phone_e164 is not null;