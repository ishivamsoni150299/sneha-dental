package com.mydentalplatform.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
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
    private final Clock clock = Clock.systemUTC();

    public PasswordResetService(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }
    public void request(String rawEmail) {
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Contact the platform owner to recover your password. Automated email recovery is not configured.");
    }
    @Transactional
    public void complete(String rawEmail, String token, String password) {
        String email = rawEmail.trim().toLowerCase();
        String tokenHash = hash(token);
        Instant now = clock.instant();
        List<UUID> challenges = jdbcTemplate.query("""
            select id from auth_challenges
            where destination = ? and purpose = 'password_reset' and secret_hash = ?
              and consumed_at is null and expires_at > ?
            order by created_at desc limit 1 for update
            """, (resultSet, row) -> resultSet.getObject("id", UUID.class), email, tokenHash, now);
        if (challenges.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This reset link is invalid or has expired.");
        }
        List<UUID> users = jdbcTemplate.query(
            "select user_id from auth_challenges where id = ?",
            (resultSet, row) -> resultSet.getObject("user_id", UUID.class), challenges.getFirst());
        if (users.isEmpty() || users.getFirst() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This reset link is invalid or has expired.");
        }
        UUID userId = users.getFirst();
        jdbcTemplate.update("""
            update users set password_hash = ?, password_migration_required = false, updated_at = ? where id = ?
            """, passwordEncoder.encode(password), now, userId);
        jdbcTemplate.update("update auth_challenges set consumed_at = ? where id = ?", now, challenges.getFirst());
        jdbcTemplate.update("""
            update refresh_tokens set revoked_at = ? where user_id = ? and revoked_at is null
            """, now, userId);
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