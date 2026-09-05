# mydentalplatform

Multi-tenant dental marketplace and clinic operations platform. Angular 19 and Spring Boot are packaged into one Docker image; PostgreSQL is the only database.

## Architecture

```text
Browser -> Render Docker service -> Spring Boot -> Supabase PostgreSQL
                              |-> Angular static application
                              |-> Razorpay (optional billing)
                              |-> Resend (optional password email)
```

Core features do not use Firebase, Vercel, or patient OTP. Patients manage appointments with the booking reference and matching phone number. Optional AI and outbound-call routes return HTTP 503 until a provider integration is enabled.

## Local Development

Prerequisites: Node 22, Java 25, and PostgreSQL 15 or newer.

```powershell
npm ci
npm start

$env:JAVA_HOME = 'C:\path\to\jdk-25'
$env:JDBC_DATABASE_URL = 'jdbc:postgresql://localhost:5432/mydentalplatform'
$env:DATABASE_USERNAME = 'mydentalplatform'
$env:DATABASE_PASSWORD = 'change-me'
backend\mvnw.cmd spring-boot:run
```

Angular runs at `http://localhost:4200`; Spring runs at `http://localhost:8080`. For the production-shaped application, build and run the Docker image instead.

## Validation

```powershell
npm run lint
npm run build
npx ng test --watch=false --browsers=ChromeHeadless

$env:JAVA_HOME = 'C:\path\to\jdk-25'
backend\mvnw.cmd -B test
```

After deployment, set the production variables locally and run `npm run release:check`.

## Free Deployment

Use these free tiers:

- Render free Docker web service for Angular and Spring Boot
- Supabase free project for PostgreSQL
- Resend free tier for password-reset email, if needed

Free Render services sleep while idle, so the first request after inactivity can take about a minute. Supabase and provider quotas remain subject to their current free-tier limits.

### 1. Create Supabase PostgreSQL

1. Create a Supabase project.
2. Open **Connect**, select the transaction pooler, and copy its host, database, user, and password.
3. Build the JDBC URL in this form:

```text
jdbc:postgresql://POOLER_HOST:6543/postgres?sslmode=require&prepareThreshold=0
```

Flyway applies every file in `backend/src/main/resources/db/migration` when Spring starts. Do not manually create application tables.

### 2. Deploy the Render Blueprint

1. Push `main` to GitHub.
2. In Render, choose **New > Blueprint** and select this repository.
3. Render reads `render.yaml` and builds the root `Dockerfile`.
4. Set these secret variables:

| Variable | Required | Value |
|---|---:|---|
| `JDBC_DATABASE_URL` | Yes | Supabase transaction-pooler JDBC URL |
| `DATABASE_USERNAME` | Yes | Supabase pooler username |
| `DATABASE_PASSWORD` | Yes | Supabase database password |
| `JWT_SECRET` | Yes | Base64-encoded random value of at least 32 bytes |
| `BOOTSTRAP_ADMIN_EMAIL` | First deploy | Initial platform administrator email |
| `BOOTSTRAP_ADMIN_PASSWORD` | First deploy | Random 12-72 character password |
| `PUBLIC_BASE_URL` | Yes | Public HTTPS origin, without a trailing slash |
| `RESEND_API_KEY` | For password reset | Resend API key |
| `EMAIL_FROM` | For password reset | Verified sender, for example `support@example.com` |
| `SENTRY_DSN` | Optional | Browser error reporting DSN |

Generate a JWT secret in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

After the first successful login, remove `BOOTSTRAP_ADMIN_PASSWORD` and `BOOTSTRAP_ADMIN_EMAIL` from Render. The administrator remains in PostgreSQL, and later restarts will not reset the password.

### 3. Configure DNS

Add the Render service's generated hostname as a custom domain. For tenant subdomains, add `*.mydentalplatform.com` in Render and create a wildcard CNAME with your DNS provider:

```text
*.mydentalplatform.com  CNAME  YOUR-SERVICE.onrender.com
```

Configure the apex and `www` records using the exact values Render displays. Clinic hostnames are resolved from PostgreSQL; there is no per-clinic deployment API.

### 4. Optional Razorpay Billing

Set all three variables together:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Optional plan overrides are `RAZORPAY_PLAN_STARTER_MONTHLY` and `RAZORPAY_PLAN_PRO_MONTHLY`. Configure the Razorpay webhook URL as:

```text
https://YOUR_DOMAIN/webhooks/razorpay
```

Without Razorpay credentials, set `PUBLIC_RAZORPAY_ME_URL` for manual payment or leave billing unavailable.

### 5. Verify

Render health check: `/api/health`

```powershell
$env:PUBLIC_BASE_URL = 'https://YOUR_DOMAIN'
$env:JDBC_DATABASE_URL = 'configured'
$env:DATABASE_USERNAME = 'configured'
$env:DATABASE_PASSWORD = 'configured'
$env:JWT_SECRET = 'configured'
npm run release:check
```

## Security and Operations

- Keep Supabase, JWT, Resend, and Razorpay values in Render secrets only.
- Rotate the bootstrap password immediately and then remove its variables.
- Supabase is database-only; Spring owns login, authorization, refresh tokens, and password resets.
- Public appointment changes require the booking reference or appointment identifier plus the matching phone number.
- Back up production data before any cutover. Legacy production data must be imported and verified before the old datastore is deleted.
- The Docker image runs as a non-root user and exposes only port 8080.
