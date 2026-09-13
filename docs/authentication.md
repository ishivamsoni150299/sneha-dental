# Production authentication

Patients, clinic owners, dentists and platform administrators sign in with email and password.
Spring Security issues a short-lived JWT and an HttpOnly Secure refresh cookie.
Supabase login and email magic links are retired.

All email login pages use /api/auth/login and route by the role returned by the
server. Backend authorization enforces the role, clinic and active session.
New clinic accounts start as incomplete-signup; new dentist profiles await
verification. Platform administrators cannot register publicly.

New passwords use Argon2id, requiring bcprov-jdk18on at runtime. Existing BCrypt
hashes remain accepted with the existing password. Tokens are not persisted in
browser storage. Refresh calls are shared per tab and serialized across tabs.
Logout revokes the complete session family.

Required configuration: JWT_SECRET (at least 32 decoded bytes),
SECURE_COOKIES=true, PUBLIC_BASE_URL=https://mydentalplatform.com, and database
credentials. BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD create the first
administrator only; they never overwrite existing accounts.

Accounts from retired email links that have no local password require operator
recovery. Set AUTH_RECOVERY_ID to a fresh UUID, AUTH_RECOVERY_EMAIL to the existing
account and AUTH_RECOVERY_PASSWORD to a strong 12–72 byte password. Restart once
and remove those variables. Recovery preserves the role and profile and revokes
prior sessions. Never place these values in Git.
New signups receive a private recovery code before continuing. Existing signed-in
users can generate one at /account/recovery after confirming their current password.
Only the code hash is stored. A reset consumes the code once, changes the password
and revokes existing sessions. Generate a new code after resetting. A lost password
and lost code require operator identity verification; email alone cannot reset an account.

No email/SMS delivery or third-party identity provider is needed for login, signup
or code-based recovery. The legacy operator test OTP is not used by patient pages.
Email ownership is not asserted by password registration. Patients access only
appointments bound to their authenticated user ID; knowing another person's phone
or booking reference does not expose their records. Guest booking contact emails
are stored on appointments, not reserved as password-account identities.
Sign in before booking to associate the appointment with your account. Video
booking requires a patient session. Old guest appointments require clinic-assisted
ownership verification before account association.

Regression checks cover the real password encoder, BCrypt compatibility, token
rotation/revocation, role authorization, concurrent browser refresh, logout during
refresh, and guest video access without a login cookie.
