import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clinicHasPlatformFeature,
  hasPlatformFeature,
  PLATFORM_FEATURE_LABELS,
  PLATFORM_PLANS,
  resolvePlatformPlan,
} from '../../src/app/core/config/platform-entitlements.ts';
import {
  getBillingPlanDetails,
  parseBillingSubscriptionMetadata,
  razorpaySubscriptionEndDateIso,
  resolveBillingWebhookAction,
} from '../../api/_lib/razorpay-billing.ts';

test('Free includes the clinic launch and appointment workflow only', () => {
  assert.deepEqual(PLATFORM_PLANS.trial.features, [
    'hostedWebsite',
    'onlineBooking',
    'appointmentDashboard',
    'whatsappContact',
  ]);
  assert.equal(hasPlatformFeature('trial', 'patientRecords'), false);
  assert.equal(hasPlatformFeature('trial', 'customBranding'), false);
  assert.equal(hasPlatformFeature('trial', 'aiVoiceReceptionist'), false);
});

test('Basic adds clinic operations, branding, and a custom domain', () => {
  for (const feature of [
    'patientRecords',
    'doctorManagement',
    'customBranding',
    'removePlatformBranding',
    'customDomain',
  ]) {
    assert.equal(hasPlatformFeature('starter', feature), true, feature);
  }
  assert.equal(hasPlatformFeature('starter', 'aiVoiceReceptionist'), false);
  assert.equal(hasPlatformFeature('starter', 'revenueInsights'), false);
});

test('Pro includes every supported platform feature', () => {
  for (const feature of Object.keys(PLATFORM_FEATURE_LABELS)) {
    assert.equal(hasPlatformFeature('pro', feature), true, feature);
  }
});

test('only active paid subscriptions resolve to their paid entitlements', () => {
  assert.equal(resolvePlatformPlan('starter', 'active'), 'starter');
  assert.equal(resolvePlatformPlan('pro', 'active'), 'pro');
  assert.equal(resolvePlatformPlan('starter', 'pending'), 'trial');
  assert.equal(resolvePlatformPlan('pro', 'expired'), 'trial');
  assert.equal(resolvePlatformPlan('pro', 'cancelled'), 'trial');
  assert.equal(resolvePlatformPlan(undefined, undefined), 'trial');

  assert.equal(clinicHasPlatformFeature({
    subscriptionPlan: 'pro',
    subscriptionStatus: 'expired',
  }, 'aiVoiceReceptionist'), false);
});

test('Razorpay metadata accepts only supported paid plans and billing cycles', () => {
  assert.deepEqual(parseBillingSubscriptionMetadata({
    clinicId: 'clinic-demo',
    plan: 'starter',
    billingCycle: 'monthly',
  }), {
    clinicId: 'clinic-demo',
    plan: 'starter',
    billingCycle: 'monthly',
  });
  assert.equal(parseBillingSubscriptionMetadata({
    clinicId: 'clinic-demo',
    plan: 'trial',
    billingCycle: 'monthly',
  }), null);
  assert.equal(parseBillingSubscriptionMetadata({
    clinicId: 'clinic/demo',
    plan: 'pro',
    billingCycle: 'monthly',
  }), null);
  assert.equal(parseBillingSubscriptionMetadata({
    clinicId: 'clinic-demo',
    plan: 'pro',
    billingCycle: 'weekly',
  }), null);
});

test('billing uses customer-facing labels and Razorpay period dates', () => {
  assert.equal(getBillingPlanDetails('starter', 'monthly').label, 'Basic');
  assert.equal(getBillingPlanDetails('pro', 'monthly').label, 'Pro');
  assert.equal(
    razorpaySubscriptionEndDateIso(Date.UTC(2030, 5, 15) / 1000, 'monthly'),
    '2030-06-15',
  );
});

test('webhook ordering preserves the current plan until a pending upgrade activates', () => {
  assert.equal(
    resolveBillingWebhookAction('sub_basic', 'sub_pro', 'sub_pro', 'pending'),
    'keep-current',
  );
  assert.equal(
    resolveBillingWebhookAction('sub_basic', 'sub_pro', 'sub_pro', 'activate'),
    'apply',
  );
  assert.equal(
    resolveBillingWebhookAction('sub_basic', 'sub_pro', 'sub_pro', 'terminate'),
    'clear-pending',
  );
  assert.equal(
    resolveBillingWebhookAction('sub_pro', '', 'sub_basic', 'terminate'),
    'ignore-stale',
  );
  assert.equal(
    resolveBillingWebhookAction('sub_basic', 'sub_pro', 'sub_basic', 'activate'),
    'apply',
  );
});