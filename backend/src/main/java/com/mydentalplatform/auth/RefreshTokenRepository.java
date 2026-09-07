package com.mydentalplatform.auth;

import java.sql.Timestamp;
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
        return create(userId, tokenHash, expiresAt, userAgent, UUID.randomUUID(), expiresAt);
    }

    public UUID create(UUID userId, String tokenHash, Instant expiresAt, String userAgent, UUID family, Instant familyExpiresAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
            insert into refresh_tokens (id, user_id, token_hash, expires_at, user_agent, family_id, family_expires_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """, id, userId, tokenHash, Timestamp.from(expiresAt.isBefore(familyExpiresAt) ? expiresAt : familyExpiresAt),
            userAgent == null ? null : userAgent.substring(0, Math.min(512, userAgent.length())), family, Timestamp.from(familyExpiresAt));
        return id;
    }

    public Optional<RefreshSession> findActiveForUpdate(String tokenHash, Instant now) {
        return jdbcTemplate.query("""
            select rt.id as token_id, rt.family_id, rt.family_expires_at,
                   u.id, u.clinic_id, u.role::text, u.email, u.phone_e164, u.password_hash,
                   u.email_verified, u.phone_verified, u.enabled, u.password_migration_required
            from refresh_tokens rt
            join users u on u.id = rt.user_id
            where rt.token_hash = ? and rt.revoked_at is null and least(rt.expires_at, rt.family_expires_at) > ?
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
                    resultSet.getBoolean("password_migration_required")),
                resultSet.getObject("family_id", UUID.class), resultSet.getTimestamp("family_expires_at").toInstant()),
            tokenHash, Timestamp.from(now)).stream().findFirst();
    }

    public void revokeAndReplace(UUID tokenId, UUID replacementId, Instant revokedAt) {
        int updated = jdbcTemplate.update("""
            update refresh_tokens
            set revoked_at = ?, replaced_by = ?
            where id = ? and revoked_at is null
            """, Timestamp.from(revokedAt), replacementId, tokenId);
        if (updated != 1) throw new AuthException("Refresh token has already been used.");
    }

    public void revokeByHash(String tokenHash, Instant revokedAt) {
        jdbcTemplate.update("""
            update refresh_tokens
            set revoked_at = ?
            where family_id = (select family_id from refresh_tokens where token_hash = ?) and revoked_at is null
            """, Timestamp.from(revokedAt), tokenHash);
    }

    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void revokeReplayedFamily(String tokenHash, Instant now) {
        jdbcTemplate.update("""
            update refresh_tokens set revoked_at = ? where revoked_at is null and family_id in
                (select family_id from refresh_tokens where token_hash = ? and revoked_at is not null)
            """, Timestamp.from(now), tokenHash);
    }

    public record RefreshSession(UUID tokenId, AuthUser user, UUID familyId, Instant familyExpiresAt) {
        public RefreshSession(UUID tokenId, AuthUser user) { this(tokenId, user, tokenId, Instant.now().plusSeconds(86400)); }
    }
}
