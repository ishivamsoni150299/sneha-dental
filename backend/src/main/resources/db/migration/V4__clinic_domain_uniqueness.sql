create unique index clinics_public_domain_unique
    on clinics (lower(public_config ->> 'domain'))
    where public_config ->> 'domain' is not null;

create unique index clinics_hosted_domain_unique
    on clinics (lower(public_config ->> 'hostedDomain'))
    where public_config ->> 'hostedDomain' is not null;
