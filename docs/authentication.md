# Production authentication

The application uses Supabase Auth as the OTP provider and keeps application roles, tenant scope, and session families in the platform database.

## Render variables

Set these variables on the web service before enabling OTP in production:

- `SUPABASE_URL`: `https://bzdhowtdayekdusfpmbw.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the Supabase project publishable key, stored as a secret environment variable

The service never needs a Supabase service-role key. OTP requests are rate limited, provider errors are sanitized, and refresh-token families are revoked on replay or logout.

## Supabase email and phone OTP

Email OTP is used for clinic, dentist, and platform staff. Phone OTP is used for patients. In Supabase Dashboard, open **Authentication → Providers → Phone**, enable the provider, and configure Twilio with:

- Twilio Account SID from the Twilio Console
- Twilio Auth Token stored only in Supabase's provider settings
- The Twilio phone number or Messaging Service SID used for SMS

Do not add the Twilio token to Render, source control, browser code, or issue reports. Supabase's email provider must also be configured for production delivery; custom SMTP is recommended for branded messages and reliable delivery.

Existing password sessions are intentionally invalidated by migration `V15__verified_authentication.sql`. Each user signs in once with an OTP to establish a verified Supabase identity and a new refresh-token family.
