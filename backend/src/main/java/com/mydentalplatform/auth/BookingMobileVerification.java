package com.mydentalplatform.auth;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BookingMobileVerification {
    private final JdbcTemplate jdbc;
    private final TokenService tokens;
    private final TwilioVerifyClient twilio;
    private final boolean required;
    public BookingMobileVerification(JdbcTemplate jdbc, TokenService tokens, TwilioVerifyClient twilio,
        @Value("${BOOKING_OTP_REQUIRED:false}") boolean required) { this.jdbc = jdbc; this.tokens = tokens; this.twilio = twilio; this.required = required || twilio.available(); }
    public Map<String, Boolean> status() { return Map.of("required", required, "available", twilio.available()); }
    public void send(String phone) { limit(phone, "send", 3); twilio.send(IndianPhoneNumber.parse(phone).e164()); }
    public String verify(String phone, String code) {
        String normalized = IndianPhoneNumber.parse(phone).e164();
        limit(normalized, "check", 10);
        twilio.check(normalized, code);
        String proof = UUID.randomUUID().toString() + UUID.randomUUID();
        jdbc.update("insert into booking_mobile_verifications(token_hash, phone, expires_at) values (?, ?, now() + interval '10 minutes')", tokens.hashRefreshToken(proof), normalized);
        return proof;
    }
    /** Called inside the booking transaction: a failed booking keeps the proof usable. */
    public void consume(String phone, String proof) {
        if (!required && (proof == null || proof.isBlank())) return;
        if (proof == null || proof.length() > 100 || jdbc.update("""
            update booking_mobile_verifications set consumed_at = now()
            where token_hash = ? and phone = ? and expires_at > now() and consumed_at is null
            """, tokens.hashRefreshToken(proof), IndianPhoneNumber.parse(phone).e164()) != 1)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Verify this mobile number before submitting your booking.");
    }
    private void limit(String phone, String operation, int maximum) {
        String key = tokens.hashRefreshToken("booking-otp:" + operation + ":" + IndianPhoneNumber.parse(phone).e164());
        Integer attempts = jdbc.queryForObject("""
            insert into auth_otp_limits(key_hash, window_start, attempts) values (?, now(), 1)
            on conflict(key_hash) do update set attempts = case when auth_otp_limits.window_start < now() - interval '10 minutes' then 1 else auth_otp_limits.attempts + 1 end,
            window_start = case when auth_otp_limits.window_start < now() - interval '10 minutes' then now() else auth_otp_limits.window_start end returning attempts
            """, Integer.class, key);
        if (attempts == null || attempts > maximum) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Wait 10 minutes.");
    }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 3600000)
    public void cleanExpired() { jdbc.update("delete from booking_mobile_verifications where expires_at < now()"); }
}
