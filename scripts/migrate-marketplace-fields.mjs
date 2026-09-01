import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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
const clinics = await db.collection('clinics').get();
const slugOwners = new Map();
let candidates = 0;
let migrated = 0;

for (const clinic of clinics.docs) {
  const slug = typeof clinic.data().marketplaceSlug === 'string'
    ? clinic.data().marketplaceSlug.trim().toLowerCase()
    : '';
  if (!slug) continue;

  const existingOwner = slugOwners.get(slug);
  if (existingOwner && existingOwner !== clinic.id) {
    throw new Error(`Duplicate marketplace slug "${slug}" on clinics ${existingOwner} and ${clinic.id}.`);
  }
  slugOwners.set(slug, clinic.id);
}

for (const clinic of clinics.docs) {
  const data = clinic.data();
  const missingStatus = data.marketplaceStatus === undefined;
  const slug = typeof data.marketplaceSlug === 'string'
    ? data.marketplaceSlug.trim().toLowerCase()
    : '';
  if (!missingStatus && !slug) continue;

  candidates++;
  console.log(`${apply ? 'Migrating' : 'Would migrate'} ${clinic.id}: ${[
    missingStatus ? 'marketplaceStatus=unlisted' : '',
    slug ? `reserve slug=${slug}` : '',
  ].filter(Boolean).join(', ')}`);
  if (!apply) continue;

  const batch = db.batch();
  if (missingStatus) {
    batch.update(clinic.ref, {
      marketplaceStatus: 'unlisted',
    });
  }
  if (slug) {
    batch.set(db.collection('marketplaceSlugs').doc(slug), {
      clinicId: clinic.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  migrated++;
}

console.log(JSON.stringify({ apply, scanned: clinics.size, candidates, migrated }));