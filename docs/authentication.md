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

## Supabase authentication URLs

In **Authentication -> URL Configuration**, production must use:

- Site URL: `https://mydentalplatform.com`
- Redirect URLs: `https://mydentalplatform.com/professional/signup`, `https://mydentalplatform.com/business/signup`, `https://mydentalplatform.com/business/login`, and `https://mydentalplatform.com/platform/login`

The backend calls GoTrue directly, so email requests must use
`POST /auth/v1/otp?redirect_to=<encoded callback URL>`. The SDK's `emailRedirectTo`
option is not a JSON body field in this REST endpoint. Supabase falls back to the
Site URL if the redirect is missing or not allowed, leaving users on the homepage
without an application session. Platform staff must return to `/platform/login`
so verification uses the platform portal.

After deploying a redirect fix, request a fresh email: previously issued links
keep their original destination and may already be consumed. Clinic and platform
callbacks exchange the provider token automatically; new dentist profiles also
ask for a professional name. Error fragments are cleared and shown as an expired
link message, with an option to request another link.
