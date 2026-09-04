create unique index clinics_public_domain_unique
    on clinics (lower(public_config ->> 'domain'))
    where public_config ->> 'domain' is not null;

create unique index clinics_hosted_domain_unique
    on clinics (lower(public_config ->> 'vercelDomain'))
    where public_config ->> 'vercelDomain' is not null;