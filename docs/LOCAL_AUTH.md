# Local authentication and production testing

Authentication uses the Java server, Spring Security, BCrypt password hashes, signed JWT access tokens and rotating HttpOnly refresh cookies. No Supabase account, Twilio account or email delivery service is required for clinic, dentist or platform password login.

## Test after deployment

1. Open /business/signup with a new email address, enter a password and confirm it. Account creation signs you in immediately and opens clinic setup.
2. Complete clinic setup. Reload the dashboard: the refresh cookie must restore your session.
3. Sign out and sign in at /business/login with that email and password.
4. Dentist accounts use /professional/signup and /professional/login.
5. Platform staff use /platform/login. Public signup never grants platform access.

Email is an account identifier. Password signup does not claim email ownership is verified.

## Platform owner

To create a new platform administrator, set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in the server environment, then deploy. Use a unique password of 12–72 ASCII characters. Existing accounts are never promoted or overwritten by bootstrap. Remove these variables after creation.

## Existing email-link accounts and password recovery

Existing email-link accounts may have no local password. Their roles and clinic data are preserved. The server operator can set a password without email delivery:

1. Generate a new UUID for AUTH_RECOVERY_ID.
2. Set AUTH_RECOVERY_EMAIL to the existing account email.
3. Set AUTH_RECOVERY_PASSWORD to a unique password of 12–72 ASCII characters in the hosting environment.
4. Restart/deploy the backend. Recovery runs once per UUID, sets the local password and revokes the account's existing sessions and reset challenges.
5. Remove all three variables and sign in normally.

Recovery cannot create accounts, elevate roles or enable disabled users. Confirm the account owner's identity before recovering someone else's account. Never put passwords in Git or chat.

## Production settings

Keep JWT_SECRET private and stable, SECURE_COOKIES=true, and the existing PostgreSQL connection configured. Flyway applies V17 automatically. SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY can be removed from the application environment. Historical database migrations and identity columns are retained to preserve data.

Normal patient SMS sign-in is unavailable without SMS delivery. The existing explicitly enabled, expiring test-phone flow remains available only for its allowlisted patient number; it does not grant staff access. No shared password or dummy code is used for email accounts.

Automated email password-reset requests return a clear operator-recovery message. They do not send email or depend on an external authentication provider.
