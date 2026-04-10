# Self-Service Clinic Signup — Setup Guide

## What was built

Clinic owners can now sign up **themselves** at `mydentalplatform.com/signup`.  
No WhatsApp message to you. No manual work. Fully automated.

**Flow:**
1. Clinic owner fills a 3-step form (clinic details → account → plan)
2. Clicks "Create my free website"
3. Their site is **instantly live** at `clinicname.mydentalplatform.com`
4. They receive their admin dashboard URL + login
5. If paid plan: Razorpay payment link shown on screen

---

## One-time infrastructure setup (do this now)

### Step 1: Wildcard DNS in Hostinger

Go to **Hostinger → Domains → mydentalplatform.com → DNS Zone**.

Add this record:

| Type  | Name | Points to                          | TTL  |
|-------|------|------------------------------------|------|
| CNAME | `*`  | `cname.vercel-dns.com`             | 3600 |

This makes every `*.mydentalplatform.com` subdomain resolve to Vercel.

---

### Step 2: Vercel API token + Project ID

Each clinic signup automatically calls the Vercel API to register their subdomain on your project (Hobby-plan compatible — no wildcard needed on Vercel).

**Get your Vercel API token:**
1. Vercel → Account Settings → Tokens → Create token
2. Name it `mydentalplatform-api`, scope: Full Account

**Get your Vercel Project ID:**
1. Vercel → sneha-dental project → Settings → General
2. Copy the **Project ID** (looks like `prj_xxxxxxxxxxxx`)

Add both to Vercel env vars (Step 3 below).

---

### Step 3: Vercel env vars (if not already set)

In **Vercel → Project → Settings → Environment Variables**, ensure:

| Variable                | Value                    |
|-------------------------|--------------------------|
| `FIREBASE_PROJECT_ID`   | your Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | service account email    |
| `FIREBASE_PRIVATE_KEY`  | service account key      |
| `RAZORPAY_KEY_ID`       | rzp_live_xxx             |
| `RAZORPAY_KEY_SECRET`   | your secret              |
| `RAZORPAY_PLAN_STARTER` | plan_xxx (₹399/mo plan)  |
| `RAZORPAY_PLAN_PRO`     | plan_xxx (₹699/mo plan)  |
| `APP_BASE_URL`          | https://mydentalplatform.com |
| `VERCEL_TOKEN`          | your Vercel API token        |
| `VERCEL_PROJECT_ID`     | prj_xxxxxxxxxxxx             |

---

## What happens after a clinic signs up

| Action                              | Automated? |
|-------------------------------------|------------|
| Firebase Auth user created          | ✅ Yes      |
| Firestore clinic doc created        | ✅ Yes      |
| Subdomain assigned & live           | ✅ Yes      |
| 30-day trial started                | ✅ Yes      |
| Razorpay subscription created       | ✅ Yes (paid plans) |
| Admin dashboard accessible          | ✅ Yes      |
| You notified                        | ❌ No — check Firestore / Revenue dashboard |

---

## Your role after setup

**Almost zero.** The only things you may still need to do manually:

1. **Custom domain** (Starter/Pro) — clinic wants `snehadental.com` instead of subdomain.  
   - They buy it from Hostinger/GoDaddy
   - Add `domain: 'snehadental.com'` to their Firestore doc
   - Add the domain in Vercel for that project (or point DNS to Vercel)
   - This can be automated later with the Vercel API

2. **Content updates** (Starter: 1/month) — if they WhatsApp you to update services/photos.  
   - Use `/business/clinics/:id/edit` in your admin panel

3. **Monitoring** — check `/business/revenue` and `/business/analytics` periodically.

---

## Clinic admin capabilities (self-serve)

Once live, the clinic admin can do these **without contacting you**:

- View and manage appointments (`/admin` dashboard)
- Edit clinic info — hours, services, contact (`/admin/settings`)
- Cancel appointments inline
- View their booking history

---

## Testing the signup flow locally

1. `npm start`
2. Visit `http://localhost:4200/business/signup`
3. Fill the form (use any test email + phone)
4. On submit — it calls `/api/self-signup` (only works on Vercel, not localhost)

To test the full API locally:
```bash
npx vercel dev
```
Then visit `http://localhost:3000/business/signup`.

---

## Revenue impact

Every self-service signup that converts to paid = **₹399–₹699/month recurring**  
with **zero manual work** from you after the initial infrastructure setup.
