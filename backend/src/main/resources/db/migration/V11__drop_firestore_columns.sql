-- V11: Remove legacy firestore_id columns left over from the Firebase/Firestore migration.
-- These columns are unused dead weight that confuses new developers.

ALTER TABLE clinics DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE doctors DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE appointments DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE leads DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE lead_activities DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE contacts DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE voice_sessions DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE appointment_reviews DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE appointment_review_reports DROP COLUMN IF EXISTS firestore_id;
ALTER TABLE provider_verification_events DROP COLUMN IF EXISTS firestore_id;
