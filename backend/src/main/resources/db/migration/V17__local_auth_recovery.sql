-- An operator recovery request runs once, even across restarts or replicas.
CREATE TABLE auth_operator_recoveries (
    request_id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auth_operator_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_operator_recoveries FROM PUBLIC;
