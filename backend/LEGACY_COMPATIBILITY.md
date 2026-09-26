# Legacy Doctor → Provider Compatibility Layer

## Background

The platform evolved from a clinic-centric model (doctors belong to clinics) to a provider-centric model (providers can be independent or clinic-affiliated). Migration V13 (`V13__independent_provider_directory.sql`) introduced the canonical `providers`, `practice_locations`, and `provider_location_memberships` tables.

To preserve backward compatibility with existing appointments, slot calculations, and foreign key constraints, four compatibility mechanisms exist:

## Compatibility Mechanisms

### 1. Dual-write on clinic doctor CRUD (`DoctorController.java`)

When a clinic admin adds, updates, or deletes a doctor:
- The `doctors` table is updated (legacy).
- The `providers` and `provider_location_memberships` tables are synchronised.
- Marked with `// COMPAT(legacy-doctor)` in code.

### 2. Reverse sync on dentist workspace (`ProviderWorkspaceController.java`)

When a dentist updates their schedule via the professional workspace:
- `provider_location_memberships.schedule` is updated (canonical).
- `doctors.schedule` is also updated (legacy dual-write).
- Marked with `// COMPAT(legacy-doctor)` in code.

### 3. Shadow clinic/doctor materialisation (`AppointmentService.java`)

When an independent dentist (no `legacy_doctor_id`) receives an appointment:
- A synthetic `clinics` row is created with `id = provider_id`.
- A synthetic `doctors` row is created so `appointments.doctor_id` FK is satisfied.
- This allows the booking engine's slot uniqueness constraint (`appointment_slots`) to work without schema changes.

### 4. Marketplace DTO synthesis (`ClinicQueryService`, `MarketplaceService`)

When a marketplace slug lookup doesn't find a clinic:
- The system falls back to `providers` and synthesises a clinic-compatible DTO.
- Frontend `MarketplaceService.getVerifiedClinicBySlug()` auto-retries via `/api/v1/providers/{slug}` on 404.

## OR-fallback joins

Several queries use patterns like:
```sql
JOIN providers p ON (a.provider_id = p.id
    OR (a.provider_id IS NULL AND a.doctor_id = p.legacy_doctor_id))
```

These exist because pre-V13 appointments have `provider_id = NULL` and only `doctor_id`. After V23 backfills `provider_id`, the OR clause becomes dead code.

## Files containing compatibility code

| File | Mechanism | Marker |
|---|---|---|
| `ProviderWorkspaceController.java` | OR-fallback joins, dual-write to `doctors.schedule` | `// COMPAT(legacy-doctor)` |
| `ProviderController.java` | `is_independent` derived from `legacy_doctor_id IS NULL` | `// COMPAT(legacy-doctor)` |
| `DoctorController.java` | Dual-write to `providers` on doctor CRUD | `// COMPAT(legacy-doctor)` |
| `AppointmentService.java` | Shadow materialisation, `legacy_doctor_id` checks | `// COMPAT(legacy-doctor)` |
| `VideoConsultationService.java` | OR-fallback join | `// COMPAT(legacy-doctor)` |
| `ClinicQueryService.java` | Marketplace DTO synthesis fallback | (implicit) |
| `MarketplaceService.ts` | Frontend slug lookup retry | (implicit) |

## Removal checklist

The compatibility layer can be removed when ALL of the following are true:

- [ ] V23 migration (`V23__backfill_appointment_provider_ids.sql`) has been deployed to all environments.
- [ ] `SELECT count(*) FROM appointments WHERE provider_id IS NULL AND doctor_id IS NOT NULL` returns **0**.
- [ ] `SELECT count(*) FROM appointments WHERE practice_location_id IS NULL AND clinic_id IS NOT NULL` returns **0**.
- [ ] No new code paths create appointments without setting `provider_id`.
- [ ] The `doctors` table can be deprecated (requires removing `appointment_slots` FK and booking engine refactor).

## Timeline

- **Now:** V23 deployed, COMPAT markers added, monitoring query results.
- **+30 days:** Confirm backfill complete across all environments.
- **+60 days:** Remove OR-fallback joins and dual-write code (separate PR).
- **+90 days:** Evaluate deprecating the `doctors` table entirely.
