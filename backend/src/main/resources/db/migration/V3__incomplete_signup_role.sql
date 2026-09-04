alter type user_role add value if not exists 'incomplete_signup';

alter table users drop constraint users_tenant_role_check;
alter table users add constraint users_tenant_role_check check (
    (role = 'clinic_admin' and clinic_id is not null) or
    (role <> 'clinic_admin' and clinic_id is null)
);