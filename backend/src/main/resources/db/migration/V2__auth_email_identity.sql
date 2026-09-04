create unique index users_email_lower_unique
    on users (lower(email))
    where email is not null;