-- Move the platform-hosted clinic address to a provider-neutral field.
drop index if exists dental.clinics_hosted_domain_unique;

update dental.clinics
set public_config = (public_config - 'vercelDomain') ||
    case
        when public_config ? 'hostedDomain' then '{}'::jsonb
        else jsonb_build_object('hostedDomain', public_config -> 'vercelDomain')
    end
where public_config ? 'vercelDomain';

create unique index clinics_hosted_domain_unique
    on dental.clinics (lower(public_config ->> 'hostedDomain'))
    where public_config ->> 'hostedDomain' is not null;
