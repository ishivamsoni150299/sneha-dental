package com.mydentalplatform.auth;

import java.time.Instant;
import java.util.Optional;
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

    public Optional<RefreshSession> findActiveForUpdate(String tokenHash, Instant now) {
        return jdbcTemplate.query("""
            select rt.id as token_id,
                   u.id, u.clinic_id, u.role::text, u.email, u.phone_e164, u.password_hash,
                   u.email_verified, u.phone_verified, u.enabled, u.password_migration_required
            from refresh_tokens rt
            join users u on u.id = rt.user_id
            where rt.token_hash = ? and rt.revoked_at is null and rt.expires_at > ?
            for update of rt
            """, (resultSet, rowNumber) -> new RefreshSession(
                resultSet.getObject("token_id", UUID.class),
                new AuthUser(
                    resultSet.getObject("id", UUID.class),
                    resultSet.getObject("clinic_id", UUID.class),
                    UserRole.fromDatabase(resultSet.getString("role")),
                    resultSet.getString("email"),
                    resultSet.getString("phone_e164"),
                    resultSet.getString("password_hash"),
                    resultSet.getBoolean("email_verified"),
                    resultSet.getBoolean("phone_verified"),
                    resultSet.getBoolean("enabled"),
                    resultSet.getBoolean("password_migration_required"))),
            tokenHash, now).stream().findFirst();
    }

    public void revokeAndReplace(UUID tokenId, UUID replacementId, Instant revokedAt) {
        int updated = jdbcTemplate.update("""
            update refresh_tokens
            set revoked_at = ?, replaced_by = ?
            where id = ? and revoked_at is null
            """, revokedAt, replacementId, tokenId);
        if (updated != 1) throw new AuthException("Refresh token has already been used.");
    }

    public record RefreshSession(UUID tokenId, AuthUser user) {
    }
}