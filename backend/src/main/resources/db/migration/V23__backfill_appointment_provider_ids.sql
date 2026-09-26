-- Backfill provider_id on legacy appointments that only have doctor_id.
-- After this migration, the OR-fallback joins in ProviderWorkspaceController
-- (e.g. "a.provider_id IS NULL AND a.doctor_id = p.legacy_doctor_id") become dead code.
-- See backend/LEGACY_COMPATIBILITY.md for the full removal checklist.

UPDATE appointments a SET provider_id = p.id
FROM providers p
WHERE p.legacy_doctor_id = a.doctor_id
  AND a.provider_id IS NULL
  AND a.doctor_id IS NOT NULL;

-- Backfill practice_location_id where missing.
UPDATE appointments a SET practice_location_id = pl.id
FROM practice_locations pl
WHERE pl.clinic_id = a.clinic_id
  AND a.practice_location_id IS NULL
  AND a.clinic_id IS NOT NULL;
