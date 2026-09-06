-- V12: Add indexes to support SQL-based marketplace search with filters pushed into WHERE clauses.

-- GIN index on the entire marketplaceProfile JSONB for efficient containment queries
-- (locality, serviceIds @> ?, acceptingNewPatients, etc.)
CREATE INDEX idx_clinics_marketplace_profile
    ON clinics USING gin ((public_config -> 'marketplaceProfile'))
    WHERE active = true AND marketplace_status = 'verified';

-- Partial B-tree index for the common verified+active filter
CREATE INDEX idx_clinics_verified_active
    ON clinics (marketplace_status, active)
    WHERE marketplace_status = 'verified' AND active = true;

-- Text search on clinic name + doctor name for query search
CREATE INDEX idx_clinics_name_lower ON clinics (lower(name));
