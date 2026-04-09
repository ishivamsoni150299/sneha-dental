# Razorpay Billing Setup

Do this once when you're ready to collect payments.

---

## Step 1 — Razorpay Account

Sign up at https://razorpay.com and complete KYC.

Get your API keys from: **Dashboard → Settings → API Keys → Generate Key**
- Copy `Key ID` (starts with `rzp_live_...`)
- Copy `Key Secret`

---

## Step 2 — Create Subscription Plans

Go to: **Dashboard → Products → Subscriptions → Plans → + Create Plan**

Create two plans:

| Plan | Amount | Period | Interval |
|---|---|---|---|
| Starter | ₹399 | monthly | 1 |
| Pro | ₹699 | monthly | 1 |

After creating each, copy the **Plan ID** (looks like `plan_Abc123XYZ`).

---

## Step 3 — Set Up Webhook

Go to: **Dashboard → Settings → Webhooks → + Add New Webhook**

- URL: `https://YOUR-VERCEL-DOMAIN.vercel.app/api/razorpay-webhook`
- Secret: create any strong password (copy it)
- Events to enable: check all `subscription.*` events

---

## Step 4 — Firebase Service Account

Go to: **Firebase Console → Project Settings → Service Accounts → Generate new private key**

Download the JSON file. You'll need 3 values from it:
- `project_id`
- `client_email`
- `private_key`

---

## Step 5 — Add Environment Variables to Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these:

| Variable | Value |
|---|---|
| `RAZORPAY_KEY_ID` | From Step 1 |
| `RAZORPAY_KEY_SECRET` | From Step 1 |
| `RAZORPAY_WEBHOOK_SECRET` | From Step 3 |
| `RAZORPAY_PLAN_STARTER` | Plan ID from Step 2 |
| `RAZORPAY_PLAN_PRO` | Plan ID from Step 2 |
| `FIREBASE_PROJECT_ID` | `sneha-dental-6373b` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from Step 4 JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` from Step 4 JSON (paste as-is) |

After adding all variables, **redeploy** the project once.

---

## Done

After setup, the flow is automatic:
1. You click "Send Payment Link" in `/business/clinics`
2. WhatsApp opens — forward to clinic owner
3. Clinic pays once → Razorpay charges every month automatically
4. Firestore updates itself via webhook (active, subscriptionStatus, lastPaymentAt)
5. If payment fails → clinic site auto-suspends
