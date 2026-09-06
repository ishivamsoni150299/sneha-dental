-- Independent provider identities and practice locations.
-- Existing clinic doctors are backfilled without changing legacy booking IDs.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dentist';

CREATE TABLE providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    legacy_doctor_id uuid UNIQUE REFERENCES doctors(id) ON DELETE SET NULL,
    slug varchar(180) NOT NULL UNIQUE,
    full_name varchar(160) NOT NULL,
    qualification varchar(240),
    speciality varchar(160),
    biography text,
    experience_years smallint CHECK (experience_years BETWEEN 0 AND 80),
    registration_number varchar(100),
    registration_council varchar(160),
    phone_e164 varchar(20),
    photo_url text,
    languages jsonb NOT NULL DEFAULT '[]'::jsonb,
    verification_status varchar(24) NOT NULL DEFAULT 'draft',
    verified_at timestamptz,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT providers_verification_status_check
        CHECK (verification_status IN ('draft', 'pending', 'verified', 'rejected', 'suspended'))
);

CREATE UNIQUE INDEX providers_registration_unique
    ON providers (lower(registration_council), lower(registration_number))
    WHERE registration_council IS NOT NULL AND registration_number IS NOT NULL;

CREATE TABLE practice_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid REFERENCES clinics(id) ON DELETE RESTRICT,
    owner_provider_id uuid REFERENCES providers(id) ON DELETE RESTRICT,
    name varchar(180) NOT NULL,
    address_line1 varchar(240) NOT NULL,
    address_line2 varchar(240),
    locality varchar(160),
    city varchar(120) NOT NULL,
    state varchar(120),
    postal_code varchar(12),
    latitude numeric(9,6),
    longitude numeric(9,6),
    timezone varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
    phone_e164 varchar(20),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT practice_location_owner_check CHECK (
        (clinic_id IS NOT NULL AND owner_provider_id IS NULL) OR
        (clinic_id IS NULL AND owner_provider_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX practice_locations_clinic_primary_unique
    ON practice_locations (clinic_id) WHERE clinic_id IS NOT NULL;

CREATE TABLE provider_location_memberships (
    provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    location_id uuid NOT NULL REFERENCES practice_locations(id) ON DELETE RESTRICT,
    membership_role varchar(24) NOT NULL DEFAULT 'practitioner',
    status varchar(24) NOT NULL DEFAULT 'pending',
    consultation_fee integer CHECK (consultation_fee IS NULL OR consultation_fee >= 0),
    accepting_new_patients boolean NOT NULL DEFAULT true,
    schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
    invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_id, location_id),
    CONSTRAINT provider_membership_role_check
        CHECK (membership_role IN ('owner', 'practitioner', 'consultant')),
    CONSTRAINT provider_membership_status_check
        CHECK (status IN ('pending', 'active', 'declined', 'inactive'))
);

CREATE TABLE provider_services (
    provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    service_id varchar(80) NOT NULL,
    display_name varchar(160),
    active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (provider_id, service_id)
);

CREATE TABLE provider_marketplace_listings (
    provider_id uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
    publication_status varchar(24) NOT NULL DEFAULT 'unlisted',
    headline varchar(240),
    profile_completeness smallint NOT NULL DEFAULT 0 CHECK (profile_completeness BETWEEN 0 AND 100),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT provider_listing_status_check
        CHECK (publication_status IN ('unlisted', 'pending', 'published', 'suspended'))
);

CREATE TABLE provider_verification_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision varchar(24) NOT NULL CHECK (decision IN ('verified', 'rejected', 'suspended')),
    reason varchar(1000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_verification_reviews_provider_idx
    ON provider_verification_reviews (provider_id, created_at DESC);

-- Give each existing clinic a primary practice location.
INSERT INTO practice_locations (
    id, clinic_id, name, address_line1, address_line2, locality, city,
    latitude, longitude, phone_e164, active
)
SELECT c.id, c.id, c.name,
       coalesce(nullif(c.public_config ->> 'addressLine1', ''), 'Address pending'),
       nullif(c.public_config ->> 'addressLine2', ''),
       nullif(c.public_config -> 'marketplaceProfile' ->> 'locality', ''),
       coalesce(nullif(c.public_config ->> 'city', ''), 'City pending'),
       nullif(c.public_config -> 'marketplaceProfile' ->> 'latitude', '')::numeric,
       nullif(c.public_config -> 'marketplaceProfile' ->> 'longitude', '')::numeric,
       nullif(c.public_config ->> 'phoneE164', ''), c.active
FROM clinics c
ON CONFLICT (id) DO NOTHING;

-- Keep legacy doctor UUIDs as provider UUIDs so appointments can be backfilled safely.
INSERT INTO providers (
    id, legacy_doctor_id, slug, full_name, qualification, speciality,
    verification_status, verified_at, active
)
SELECT d.id, d.id,
       trim(both '-' from regexp_replace(lower(d.name), '[^a-z0-9]+', '-', 'g')) || '-' || left(d.id::text, 8),
       d.name, d.qualification, d.speciality,
       CASE WHEN c.marketplace_status = 'verified'
                  AND coalesce(c.public_config -> 'marketplaceVerifiedDoctorIds', '[]'::jsonb) ? d.id::text
            THEN 'verified' ELSE 'draft' END,
       CASE WHEN c.marketplace_status = 'verified'
                  AND coalesce(c.public_config -> 'marketplaceVerifiedDoctorIds', '[]'::jsonb) ? d.id::text
            THEN now() ELSE NULL END,
       d.available
FROM doctors d
JOIN clinics c ON c.id = d.clinic_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_location_memberships (
    provider_id, location_id, status, consultation_fee,
    accepting_new_patients, schedule, accepted_at
)
SELECT d.id, d.clinic_id, 'active',
       nullif(c.public_config -> 'marketplaceProfile' ->> 'consultationFee', '')::integer,
       coalesce((c.public_config -> 'marketplaceProfile' ->> 'acceptingNewPatients')::boolean, true),
       d.schedule, now()
FROM doctors d
JOIN clinics c ON c.id = d.clinic_id
ON CONFLICT (provider_id, location_id) DO NOTHING;

INSERT INTO provider_marketplace_listings (provider_id, publication_status, profile_completeness, published_at)
SELECT p.id,
       CASE WHEN p.verification_status = 'verified' THEN 'published' ELSE 'unlisted' END,
       CASE WHEN p.verification_status = 'verified' THEN 70 ELSE 30 END,
       CASE WHEN p.verification_status = 'verified' THEN now() ELSE NULL END
FROM providers p
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO provider_services (provider_id, service_id)
SELECT d.id, service.value
FROM doctors d
JOIN clinics c ON c.id = d.clinic_id
CROSS JOIN LATERAL jsonb_array_elements_text(
    coalesce(c.public_config -> 'marketplaceProfile' -> 'serviceIds', '[]'::jsonb)
) AS service(value)
ON CONFLICT (provider_id, service_id) DO NOTHING;

ALTER TABLE appointments ADD COLUMN provider_id uuid REFERENCES providers(id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD COLUMN practice_location_id uuid REFERENCES practice_locations(id) ON DELETE RESTRICT;
UPDATE appointments SET provider_id = doctor_id WHERE doctor_id IS NOT NULL;
UPDATE appointments SET practice_location_id = clinic_id;

CREATE INDEX providers_public_directory_idx
    ON providers (verification_status, active, full_name);
CREATE INDEX provider_memberships_location_idx
    ON provider_location_memberships (location_id, status, accepting_new_patients);
CREATE INDEX practice_locations_city_idx
    ON practice_locations (lower(city), lower(locality)) WHERE active = true;
CREATE INDEX provider_services_service_idx
    ON provider_services (service_id, provider_id) WHERE active = true;
CREATE INDEX appointments_provider_date_idx
    ON appointments (provider_id, appointment_date, appointment_time);
