ALTER TABLE users ADD COLUMN supabase_user_id uuid;
CREATE UNIQUE INDEX users_supabase_identity ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;
ALTER TABLE refresh_tokens ADD COLUMN family_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ADD COLUMN family_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');
CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);
-- Cut over existing sessions: every account must establish a verified identity.
UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;

-- Shared across instances and restarts; stores hashed destinations, never OTPs.
CREATE TABLE auth_otp_limits (
    key_hash varchar(64) PRIMARY KEY,
    window_start timestamptz NOT NULL,
    attempts integer NOT NULL
);
ALTER TABLE auth_otp_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_otp_limits FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON auth_otp_limits FROM anon;
        REVOKE ALL ON auth_otp_limits FROM authenticated;
    END IF;
END $$;
