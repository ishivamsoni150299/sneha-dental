-- Plain PostgreSQL compatibility for existing Flyway policies. Supabase already supplies these roles.
-- These roles have no login and receive no schema privileges here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
