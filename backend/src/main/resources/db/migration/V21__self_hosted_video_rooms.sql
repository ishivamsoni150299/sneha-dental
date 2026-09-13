-- Durable room leases let the API close calls after restart, expiry or cancellation.
CREATE TABLE video_room_leases (
    room_name text PRIMARY KEY,
    appointment_id uuid,
    dentist_user_id uuid,
    scheduled_at timestamptz,
    expires_at timestamptz NOT NULL,
    CHECK ((appointment_id IS NULL) <> (dentist_user_id IS NULL))
);
CREATE INDEX video_room_leases_expiry_idx ON video_room_leases(expires_at);
