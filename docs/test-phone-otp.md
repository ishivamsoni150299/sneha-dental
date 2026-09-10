# Temporary patient OTP testing without Twilio

Deploy the backend changes, then set these backend environment variables:

```text
TEST_PHONE_OTP_ENABLED=true
TEST_PHONE_OTP_VALID_UNTIL=2026-09-12T18:30:00Z
```

The example deadline is midnight at the start of September 13, 2026 in India.
Only patient login for `+919473903051` accepts `947390`. Click Send code first;
no SMS is sent for this number while test mode is active. Each request expires
after five minutes and is consumed on successful login. Existing send and verify
rate limits still apply. Other numbers and all email portals use Supabase as before.

This fixed code grants access to the patient account for that number, including
its appointments. Use only test data on this account. The code is not proof of
SMS delivery or real phone ownership.

Set `TEST_PHONE_OTP_ENABLED=false` to stop test logins early. The deadline also
stops test logins automatically. Test accounts without a real Supabase identity
lose API access when test mode ends; ordinary Supabase-linked sessions retain
their normal lifetime. Logout ends the current test session normally.

No Supabase ID is fabricated or changed. Once an SMS provider is available, the
normal verification flow can link the same patient account. These settings are
disabled by default; editing this file does not change the live service.
