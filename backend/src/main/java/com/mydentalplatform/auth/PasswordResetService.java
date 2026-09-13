package com.mydentalplatform.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class PasswordResetService {
    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;

    public PasswordResetService(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }
    public void request(String rawEmail) {
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Use your saved recovery code to reset your password. No email will be sent.");
    }
    @Transactional
    public void complete(String rawEmail, String token, String password) {
        String email = rawEmail.trim().toLowerCase(java.util.Locale.ROOT);
        String tokenHash = hash(token);
        List<UUID> recovery = jdbcTemplate.queryForList("""
            select r.user_id from account_recovery_codes r join users u on u.id = r.user_id
            where lower(u.email) = ? and u.enabled and r.code_hash = ? and r.consumed_at is null
            for update of r, u
            """, UUID.class, email, tokenHash);
        if (!recovery.isEmpty()) {
            UUID userId = recovery.getFirst();
            jdbcTemplate.update("update users set password_hash = ?, password_migration_required = false, updated_at = now() where id = ?", passwordEncoder.encode(password), userId);
            jdbcTemplate.update("update account_recovery_codes set consumed_at = now() where user_id = ?", userId);
            jdbcTemplate.update("update refresh_tokens set revoked_at = now() where user_id = ? and revoked_at is null", userId);
            jdbcTemplate.update("update auth_challenges set consumed_at = now() where user_id = ? and consumed_at is null", userId);
            return;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This recovery code is invalid or already used.");
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
