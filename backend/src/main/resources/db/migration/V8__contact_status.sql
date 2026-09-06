-- Add status column to contacts table for clinic enquiry management.
alter table contacts add column if not exists status varchar(24) not null default 'unread';

create index if not exists contacts_clinic_status_idx on contacts (clinic_id, status, created_at desc);
