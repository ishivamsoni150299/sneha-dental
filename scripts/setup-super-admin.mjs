/**
 * One-time script to create the super admin account.
 * Run: node scripts/setup-super-admin.mjs YOUR_PASSWORD
 *
 * What it does:
 *  1. Creates admin@mydentalplatform.com in Firebase Auth
 *  2. Adds the user's UID to Firestore superAdmins collection
 */

const EMAIL      = 'admin@mydentalplatform.com';
const API_KEY    = 'AIzaSyA_efkmE9dWE6jjyDwgE6qGMLrx_BMJEmQ';
const PROJECT_ID = 'sneha-dental-6373b';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/setup-super-admin.mjs YOUR_PASSWORD');
  process.exit(1);
}

// ── Step 1: Create user in Firebase Auth ─────────────────────────────────────
console.log('Creating Firebase Auth user...');
const signUpRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: EMAIL, password, returnSecureToken: true }),
  }
);

const signUpData = await signUpRes.json();

if (!signUpRes.ok) {
  const code = signUpData?.error?.message ?? 'UNKNOWN';
  if (code === 'EMAIL_EXISTS') {
    console.log('User already exists in Firebase Auth. Fetching UID...');
    // Sign in to get the UID
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: EMAIL, password, returnSecureToken: true }),
      }
    );
    const signInData = await signInRes.json();
    if (!signInRes.ok) {
      console.error('Sign-in failed:', signInData?.error?.message);
      process.exit(1);
    }
    await addToFirestore(signInData.localId, signInData.idToken);
  } else {
    console.error('Failed to create user:', code);
    process.exit(1);
  }
} else {
  console.log(`Auth user created. UID: ${signUpData.localId}`);
  await addToFirestore(signUpData.localId, signUpData.idToken);
}

// ── Step 2: Add UID to Firestore superAdmins collection ──────────────────────
async function addToFirestore(uid, idToken) {
  console.log('Adding to Firestore superAdmins collection...');

  const firestoreUrl =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/superAdmins/${uid}`;

  const res = await fetch(firestoreUrl, {
    method:  'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: {
        email: { stringValue: EMAIL },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Firestore write failed:', data?.error?.message ?? JSON.stringify(data));
    console.log('\nManual fallback:');
    console.log('  Go to Firebase Console → Firestore → superAdmins → New document');
    console.log(`  Document ID: ${uid}`);
    console.log('  Field: email =', EMAIL);
    process.exit(1);
  }

  console.log('\n✓ Super admin setup complete!');
  console.log(`  Email : ${EMAIL}`);
  console.log(`  UID   : ${uid}`);
  console.log('\nYou can now log in at /business/login');
}
