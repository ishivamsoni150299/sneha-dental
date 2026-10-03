# Payment implementation and verification

Updated 2026-10-03. This completes the existing monthly clinic billing and manual visit-payment journeys in the repository. Deployment and a real provider payment are separate acceptance steps.

## Existing payment methods

| Money flow | Method | Behavior |
| --- | --- | --- |
| Clinic to platform | Razorpay monthly subscription | Basic ₹999/month; Pro ₹2,499/month. Hosted checkout, provider-confirmed activation, renewals, cancellation at cycle end, charge history and reconciliation. |
| Clinic to platform, fallback | Configured HTTPS manual payment link | No automatic activation. Platform staff verify the external transaction and record its unique reference, monthly amount and date in the existing clinic billing form. The staff identity is recorded. |
| Patient to clinic | Cash, UPI, card, insurance, other | Clinic staff record money received. These labels do not process a payment or an insurance claim. Partial payments now have a separate amount received. |

Bookings and video consultations continue without platform-collected patient prepayment. Dentist payouts, marketplace commissions, online patient collection, refund execution, settlement reconciliation, tax invoices and yearly subscriptions are not introduced by this consolidation. Razorpay account payment methods depend on the merchant's enabled subscription methods; the app does not promise that every checkout method supports recurring payments.

## Implemented journeys

- Paid clinic signup finishes clinic creation first, refreshes the owner's session, then uses the existing billing endpoint. Checkout errors retain the created clinic and allow checkout-only retry; resubmission does not create another clinic.
- Settings, signup and expired-plan pages share a payment-status panel with a normal payment link, explicit status refresh, provider errors and recorded payment history. Returning from checkout does not itself grant paid access.
- Platform staff can create a link, explicitly open/share it with WhatsApp, and reconcile a subscription ID from Razorpay in the existing clinic list. Creating a link no longer claims a WhatsApp message was sent.
- The backend reserves a local checkout before calling Razorpay. Concurrent requests cannot create independent mandates; repeated requests reuse a known pending checkout. An ambiguous timeout stays reserved until the matching provider subscription is reconciled. Do not manually discard an unresolved reservation and start another chargeable mandate.
- Subscription webhooks require HMAC verification and a locally bound provider ID or matching checkout attempt. Clinic, plan and billing-cycle metadata must match. The handler fetches current provider state while holding the clinic lock, so delayed event snapshots cannot roll entitlements backwards. Event IDs and payment references are deduplicated independently.
- Successful captured charges are stored separately from subscription status. Provider period dates update the clinic's renewal date. Refresh/reconciliation recovers missed charges from up to 100 provider invoices for the subscription. This is gross collection history, not confirmation of a bank settlement.
- Cancellation preserves paid access through the paid period; cancelling an unpaid checkout restores Free. Only the current subscription can be managed through the owner endpoint. Existing active subscriptions must be managed before another subscription can be created. Mid-cycle Basic/Pro changes and prorating require billing support; creating a second mandate is blocked.
- Staff-entered manual activation requires the exact monthly amount, a non-future payment date and a unique reference. The paid period runs one month from that date. Provider-managed fields are protected from stale clinic-form saves. Manual verification is a staff attestation, not automatic gateway verification.
- Patient totals use the amount received rather than treating a partial payment as fully unpaid or fully collected. Historical partial payments with no known received amount remain marked for reconciliation. Patient-facing appointment responses continue to omit internal financial fields.

## Configuration and deployment

Apply Flyway migration `V28__billing_records_and_partial_payments.sql` through the normal deployment. It backfills existing known subscription IDs, adds captured/manual payment records, and introduces appointment `amount_paid`. Applied older migrations are unchanged.

Configure server-side values:

```
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_PLAN_STARTER_MONTHLY
RAZORPAY_PLAN_PRO_MONTHLY
```

The provider plans must use INR, interval 1, period monthly, and amounts 99900/249900 paise. Checkout verifies these properties. Partial Razorpay configuration fails startup rather than accepting payments that cannot activate a plan. With no Razorpay credentials, `PUBLIC_RAZORPAY_ME_URL` can provide the manual fallback; without either method checkout returns an actionable unavailable error.

Configure `/webhooks/razorpay` on the deployed API for subscription authenticated, activated, charged, resumed, pending, halted, paused, cancelled, completed and expired events. Use matching test/live credentials, plans and webhook secrets. Never put secret keys in Angular public environment files.

For an ambiguous checkout timeout, locate the subscription in Razorpay using its `clinicId` and `checkoutId` notes, then use **Clinics → payment link → Recover or reconcile a Razorpay checkout**. The backend binds only the matching recorded attempt. If Razorpay has no matching subscription, billing support must establish the outcome before any retry reservation is released; the application deliberately does not infer failure from a timeout.

## Validation

- Embedded PostgreSQL tests exercise migration, checkout reuse/concurrency, tenant ownership, signature checks, event/charge deduplication, rollback, delayed events, period tracking, cancellation, manual payment records, missed-webhook reconciliation, timeout recovery and partial balances.
- The complete backend suite passed with 161 passing tests and one pre-existing skipped startup test before the final reconciliation additions. All 42 focused tests passed after those additions, including the upgrade migration with historical payment records and late Razorpay events following manual activation. Evidence: `artifacts/payment-backend-all.log` and `artifacts/payment-backend-final.log`.
- All 250 Angular tests passed. ESLint and production build passed for the changed frontend. Evidence: `artifacts/payment-angular-tests.log`, `artifacts/payment-lint.log`, `artifacts/payment-build.log`.
- `node scripts/payment-ui-check.mjs` checks pending/error/retry/active/history, keyboard interaction, and paid signup with checkout-only retry at 320, 390 and 1440px using intercepted local API responses. Screenshots and logs are in `artifacts/payment-ui/` and `artifacts/payment-ui-check.log`. These are presentation tests, not live Razorpay acceptance.
- Before enabling live billing, verify hosted payment completion, signed webhook activation, renewal/failure/cancellation, provider invoice matching and actual settlement using controlled accounts. No live payment, production data change or deployment was performed here.

## Provider references

- [Create a Razorpay subscription](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/)
- [Subscription webhooks](https://razorpay.com/docs/webhooks/subscriptions/)
- [Webhook delivery and duplicate handling](https://razorpay.com/docs/webhooks/best-practices/)
- [Subscription updates and payment-method restrictions](https://razorpay.com/docs/api/payments/subscriptions/update-subscription/)
