package com.mydentalplatform.auth;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OtpLoginService {
    private final SupabaseOtpClient provider;
    private final JdbcTemplate jdbc;
    private final AuthUserRepository users;
    private final ClinicLoginService login;
    private final TokenService tokens;
    private final TransactionTemplate transaction;
    private final TestPhoneOtp testPhoneOtp;
    public OtpLoginService(SupabaseOtpClient provider, JdbcTemplate jdbc, AuthUserRepository users,
        ClinicLoginService login, TokenService tokens, PlatformTransactionManager manager, TestPhoneOtp testPhoneOtp) {
        this.provider = provider; this.jdbc = jdbc; this.users = users; this.login = login; this.tokens = tokens;
        this.transaction = new TransactionTemplate(manager);
        this.testPhoneOtp = testPhoneOtp;
    }

    public void send(String identity, String portal) {
        String normalized = normalize(identity, portal);
        limit("send:" + normalized, 3, 600);
        if (testPhoneOtp.permits(normalized, portal)) {
            transaction.executeWithoutResult(status -> {
                jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", normalized);
                jdbc.update("update auth_challenges set consumed_at = now() where destination = ? and purpose = 'phone_otp' and consumed_at is null", normalized);
                jdbc.update("""
                    insert into auth_challenges(purpose, destination, secret_hash, expires_at)
                    values ('phone_otp', ?, ?, now() + interval '5 minutes')
                    """, normalized, tokens.hashRefreshToken("test-phone-otp:" + normalized));
            });
            return;
        }
        provider.send(normalized, portal.equals("patient"), redirectPath(portal));
    }

    public ClinicLoginService.LoginResult verify(String identity, String portal, String code, String fullName, String userAgent) {
        String normalized = normalize(identity, portal);
        limit("verify:" + normalized, 10, 600);
        if (testPhoneOtp.permits(normalized, portal)) {
            testPhoneOtp.check(normalized, portal, code);
            return transaction.execute(status -> {
                jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", normalized);
                testPhoneOtp.check(normalized, portal, code);
                int consumed = jdbc.update("""
                    update auth_challenges set consumed_at = now()
                    where destination = ? and purpose = 'phone_otp' and secret_hash = ?
                      and consumed_at is null and expires_at > now()
                    """, normalized, tokens.hashRefreshToken("test-phone-otp:" + normalized));
                if (consumed != 1) throw new AuthException("Request a new code and try again.");
                AuthUser user = users.findByPhone(normalized).orElseGet(() -> users.createPatient(normalized));
                if (!user.enabled() || user.role() != UserRole.PATIENT)
                    throw new AuthException("This account does not have access to this portal.");
                // Do not invent or overwrite a Supabase identity; real SMS can link it later.
                jdbc.update("update users set phone_verified = true, password_migration_required = false where id = ?", user.id());
                return login.verifiedLogin(users.findByPhone(normalized).orElseThrow(), userAgent);
            });
        }
        var verified = provider.verify(normalized, portal.equals("patient"), code);
        return completeVerifiedLogin(verified, normalized, portal, fullName, userAgent);
    }

    public ClinicLoginService.LoginResult exchangeMagicLink(String accessToken, String portal, String fullName, String userAgent) {
        if (portal.equals("patient")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use mobile verification to sign in.");
        var verified = provider.verifyAccessToken(accessToken);
        String normalized = normalize(verified.value(), portal);
        limit("link:" + normalized, 10, 600);
        return completeVerifiedLogin(verified, normalized, portal, fullName, userAgent);
    }

    private ClinicLoginService.LoginResult completeVerifiedLogin(SupabaseOtpClient.Identity verified, String normalized,
        String portal, String fullName, String userAgent) {
        return transaction.execute(status -> {
            // Serialize simultaneous first logins without locking during the provider call.
            jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", normalized);
            AuthUser user = verified.phone() ? users.findByPhone(normalized).orElse(null) : users.findByEmail(normalized).orElse(null);
            if (user == null) {
                user = switch (portal) {
                    case "patient" -> users.createPatient(normalized);
                    case "clinic" -> users.createClinicSignup(normalized, null);
                    case "dentist" -> {
                        if (fullName == null || fullName.trim().length() < 2) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter your professional name to create a profile.");
                        yield users.createProfessionalSignup(normalized, null, fullName);
                    }
                    default -> throw new AuthException("This account does not have access to this portal.");
                };
            }
            if (!user.enabled() || !allowed(portal, user.role())) throw new AuthException("This account does not have access to this portal.");
            int updated = jdbc.update("""
                update users set supabase_user_id = ?, email_verified = case when ? then email_verified else true end,
                    phone_verified = case when ? then true else phone_verified end, password_migration_required = false
                where id = ? and (supabase_user_id is null or supabase_user_id = ?)
                """, verified.providerId(), verified.phone(), verified.phone(), user.id(), verified.providerId());
            if (updated != 1) throw new AuthException("Account identity has changed. Contact support.");
            AuthUser confirmed = verified.phone() ? users.findByPhone(normalized).orElseThrow() : users.findByEmail(normalized).orElseThrow();
            return login.verifiedLogin(confirmed, userAgent);
        });
    }

    static boolean allowed(String portal, UserRole role) {
        return switch (portal) {
            case "patient" -> role == UserRole.PATIENT;
            case "dentist" -> role == UserRole.DENTIST;
            case "platform" -> role == UserRole.PLATFORM_ADMIN;
            case "clinic" -> role == UserRole.CLINIC_ADMIN || role == UserRole.INCOMPLETE_SIGNUP;
            default -> false;
        };
    }

    static String normalize(String identity, String portal) {
        if (!Set.of("patient", "dentist", "clinic", "platform").contains(portal)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid portal.");
        String value = identity.trim().toLowerCase(Locale.ROOT);
        if (portal.equals("patient")) {
            if (!value.matches("\\+91[6-9][0-9]{9}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid Indian mobile number.");
        } else if (!value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || value.length() > 254)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid email address.");
        return value;
    }

    static String redirectPath(String portal) {
        return switch (portal) {
            case "dentist" -> "/professional/signup";
            case "clinic" -> "/business/signup";
            case "platform" -> "/platform/login";
            case "patient" -> "/";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid portal.");
        };
    }

    private void limit(String key, int max, int seconds) {
        Integer attempts = jdbc.queryForObject("""
            insert into auth_otp_limits(key_hash, window_start, attempts) values (?, now(), 1)
            on conflict(key_hash) do update set
                attempts = case when auth_otp_limits.window_start < now() - make_interval(secs => ?) then 1 else auth_otp_limits.attempts + 1 end,
                window_start = case when auth_otp_limits.window_start < now() - make_interval(secs => ?) then now() else auth_otp_limits.window_start end
            returning attempts
            """, Integer.class, tokens.hashRefreshToken(key), seconds, seconds);
        if (attempts == null || attempts > max) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Wait 10 minutes before trying again.");
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 3600000)
    public void cleanExpiredLimits() {
        jdbc.update("delete from auth_otp_limits where window_start < now() - interval '1 day'");
    }
}
