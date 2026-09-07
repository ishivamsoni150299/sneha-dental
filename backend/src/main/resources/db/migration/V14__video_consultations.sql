ALTER TABLE appointments
    ADD COLUMN consultation_mode varchar(16) NOT NULL DEFAULT 'in_person'
    CHECK (consultation_mode IN ('in_person', 'video'));

COMMENT ON COLUMN appointments.consultation_mode IS 'Visit format; existing appointments remain in-person.';
