-- OTP attempt counters are maintained only by the backend JDBC role.
-- Keep client-facing roles denied even if they can reach the schema.
CREATE POLICY auth_otp_limits_deny_client_access
    ON auth_otp_limits
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);
