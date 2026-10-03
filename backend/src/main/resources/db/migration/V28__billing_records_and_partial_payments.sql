-- Keep provider state and individual collections separate from clinic entitlements.
alter table subscriptions add column checkout_url text;
alter table subscriptions add column provider_plan_id varchar(128);
create index subscriptions_clinic_created on subscriptions (clinic_id, created_at desc);

-- Existing provider IDs remain recognizable after upgrading the billing handler.
insert into subscriptions (clinic_id, provider_subscription_id, plan, billing_cycle, status)
select a.clinic_id, a.razorpay_subscription_id, c.subscription_plan,
       coalesce(a.billing_config ->> 'billingCycle', 'monthly'), 'legacy'
from clinic_private_accounts a join clinics c on c.id = a.clinic_id
where a.razorpay_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  and c.subscription_plan in ('starter', 'pro')
on conflict (provider_subscription_id) do nothing;

insert into subscriptions (clinic_id, provider_subscription_id, plan, billing_cycle, status)
select clinic_id, billing_config ->> 'pendingRazorpaySubscriptionId',
       billing_config ->> 'pendingPlan', 'monthly', 'legacy'
from clinic_private_accounts
where billing_config ->> 'pendingRazorpaySubscriptionId' ~ '^sub_[A-Za-z0-9]+$'
  and billing_config ->> 'pendingPlan' in ('starter', 'pro')
on conflict (provider_subscription_id) do nothing;

create table billing_payments (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references clinics(id) on delete restrict,
    subscription_id uuid references subscriptions(id) on delete restrict,
    provider varchar(24) not null,
    payment_reference varchar(160) not null,
    amount_paise bigint not null check (amount_paise > 0),
    currency varchar(3) not null default 'INR' check (currency = 'INR'),
    paid_at timestamptz not null,
    recorded_by uuid references users(id) on delete restrict,
    created_at timestamptz not null default now(),
    unique (provider, payment_reference)
);
create index billing_payments_clinic_date on billing_payments (clinic_id, paid_at desc);

alter table appointments add column amount_paid numeric(12,2);
update appointments set amount_paid = case when payment_status = 'paid' then amount_charged else 0 end
where payment_status in ('paid', 'unpaid') and amount_charged is not null and amount_charged >= 0;
-- Historical partial payments stay unknown until staff reconcile them.
alter table appointments add constraint appointment_amount_paid_valid
    check (amount_paid is null or (amount_paid >= 0 and amount_charged is not null and amount_paid <= amount_charged));
