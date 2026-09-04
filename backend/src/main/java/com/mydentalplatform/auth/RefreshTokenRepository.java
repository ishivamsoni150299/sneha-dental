package com.mydentalplatform.auth;

import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RefreshTokenRepository {
    private final JdbcTemplate jdbcTemplate;

    public RefreshTokenRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public UUID create(UUID userId, String tokenHash, Instant expiresAt, String userAgent) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
            insert into refresh_tokens (id, user_id, token_hash, expires_at, user_agent)
            values (?, ?, ?, ?, ?)
            """, id, userId, tokenHash, expiresAt, userAgent);
        return id;
    }
}