CREATE TABLE account_recovery_codes (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash char(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz
);
ALTER TABLE account_recovery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_recovery_codes FROM PUBLIC;

-- Guest booking contact details remain on appointments. They must not reserve a
-- login email or prove ownership of a future password account.
UPDATE users SET email = NULL
WHERE role = 'patient' AND password_hash IS NULL AND NOT phone_verified
  AND phone_e164 IS NOT NULL;
