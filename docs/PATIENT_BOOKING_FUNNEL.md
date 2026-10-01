# Patient booking funnel

The patient funnel retains the existing design system and city/treatment SEO URLs. Public navigation separates `/dentists`, `/appointments`, `/professional`, `/business`, and `/account`. Dentist signup uses `/account?mode=signup&type=dentist`; clinic signup uses `type=clinic`. Existing role and tenant guards remain authoritative.

Booking links preserve the treatment and location context, then select a real dentist, consultation mode, date and available slot. In-clinic and video requests share patient details and verification, but retain their distinct availability and confirmation rules. A submitted request is pending until the clinic or dentist confirms it. Mobile verification never grants account ownership; existing authenticated ownership and email claim checks still apply.

## Empty marketplace and trust

Zero results show a request form with location, problem, preferred date/time, name, mobile, optional email and contact consent. Requests are persisted by `POST /api/public/dentist-requests`. Platform administrators manage them at `/business/patient-requests`; clinic and dentist accounts cannot access this inbox. A request does not promise an appointment or automatic matching.

Cards use published profile data, real review aggregates and actual slots. Missing photos, fees, qualification details or verification dates are identified as missing. Available Today appears only when returned slots exist. Advanced filters are hidden in empty/error/loading states. Filtered or empty search combinations are marked noindex; established city/treatment URLs remain intact. Account, professional, clinic and legal pages provide route-specific server content.

## Twilio Verify activation

Set these values securely in the existing Render service's environment, never in source control:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Providing all three valid bindings automatically requires mobile verification for public booking APIs. `BOOKING_OTP_REQUIRED=true` additionally enforces verification when credentials are missing, causing booking to fail closed with a visible unavailable message. Without credentials or this explicit flag, the existing booking behavior is retained during rollout. Set the flag for the completed production rollout; the code alone does not establish live SMS readiness.

The Twilio Verify service must permit SMS delivery to the intended Indian mobile numbers. Validate delivery and approval with a controlled real phone after configuring it. No production test codes or fallback approval exist. The existing test-only account OTP endpoint is not used by this funnel.

`GET /api/public/booking-verification` exposes only `required` and `available`. Sending and checking codes are rate-limited by IP and persistent hashed phone keys. Approved proofs are random, hashed in PostgreSQL, phone-bound, single-use and expire after ten minutes. Proof consumption is inside the booking transaction, so a failed slot booking does not destroy a usable proof.

## Automated validation

- `npm test -- --watch=false --browsers=ChromeHeadless`, `npm run lint`, `npm run build`, `npm run test:artifacts`
- `mvn -B -f backend/pom.xml test`
- `node --test scripts/release-check.test.mjs`
- `npm run test:e2e` with the isolated PostgreSQL/API environment documented in `.github/workflows/ci.yml`

Browser tests exercise in-clinic and mobile video booking, incorrect/correct OTP, patient appointment status, clinic/dentist confirmation, guest ownership claims, rescheduling/cancellation and patient/dentist/clinic signup. They also submit a dentist request and verify administrative access. The suite checks public and authenticated routes at mobile and desktop widths.

For SMS browser tests, set `E2E_BOOKING_OTP=1` and launch the test-source-only `BookingFunnelTestApplication`. It requires `E2E_ISOLATED_DB=1` and a loopback PostgreSQL database named with `e2e` or `test`. Only SMS delivery is simulated; booking, verification proof persistence, authorization and availability use the real API/database. This launcher and its fixed SMS code are excluded from the production JAR. `CHROME_BIN` can select a locally installed test browser.

Analytics emit search, filter, dentist_view, booking_started, slot_selected, otp_requested, booking_submitted, booking_confirmed, empty_result and request_dentist_submitted through the existing consent-aware, privacy-filtered analytics service. Patient names, phone numbers, verification codes and proof tokens are not event payloads.
