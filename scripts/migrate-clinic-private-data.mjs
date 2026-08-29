import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PRIVATE_FIELDS = [
  'adminUid',
  'adminEmail',
  'billingEmail',
  'billingNotes',
  'billingCycle',
  'lastPaymentDate',
  'lastPaymentAmount',
  'lastPaymentRef',
  'razorpaySubscriptionId',
  'leadSource',
  'marketingAttribution',
  'grandfatheredUntil',
  'grandfatheredPlan',
  'voiceBudgetCap',
  'voiceAutoStop',
];

const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required.');
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const auth = getAuth();
const clinics = await db.collection('clinics').get();
let candidates = 0;
let migrated = 0;

for (const clinic of clinics.docs) {
  const data = clinic.data();
  const privateData = Object.fromEntries(
    PRIVATE_FIELDS
      .filter(field => data[field] !== undefined)
      .map(field => [field, data[field]]),
  );
  const fields = Object.keys(privateData);
  if (!fields.length) continue;

  candidates++;
  console.log(`${apply ? 'Migrating' : 'Would migrate'} ${clinic.id}: ${fields.join(', ')}`);
  if (!apply) continue;

  if (typeof privateData.adminUid === 'string' && privateData.adminUid) {
    const owner = await auth.getUser(privateData.adminUid);
    await auth.setCustomUserClaims(owner.uid, {
      ...(owner.customClaims ?? {}),
      clinicId: clinic.id,
      role: 'admin',
    });
  }

  const batch = db.batch();
  batch.set(clinic.ref.collection('private').doc('account'), {
    ...privateData,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.update(clinic.ref, Object.fromEntries(
    fields.map(field => [field, FieldValue.delete()]),
  ));
  await batch.commit();
  migrated++;
}

console.log(JSON.stringify({ apply, scanned: clinics.size, candidates, migrated }));
