package com.mydentalplatform.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class AuthUserRepository {
    private static final RowMapper<AuthUser> USER_MAPPER = AuthUserRepository::mapUser;

    private final JdbcTemplate jdbcTemplate;

    public AuthUserRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<AuthUser> findByEmail(String email) {
        return jdbcTemplate.query("""
            select id, clinic_id, role::text, email, phone_e164, password_hash,
                   email_verified, phone_verified, enabled, password_migration_required
            from users
            where lower(email) = lower(?)
            """, USER_MAPPER, email).stream().findFirst();
    }

    public Optional<AuthUser> findByPhone(String phone) {
        return jdbcTemplate.query("""
            select id, clinic_id, role::text, email, phone_e164, password_hash,
                   email_verified, phone_verified, enabled, password_migration_required
            from users
            where phone_e164 = ?
            """, USER_MAPPER, phone).stream().findFirst();
    }

    public AuthUser createPatient(String phone) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("insert into users (id, role, phone_e164, phone_verified) values (?, 'patient', ?, true)", id, phone);
        return findByPhone(phone).orElseThrow();
    }

    public AuthUser createClinicSignup(String email, String passwordHash) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
            insert into users (id, role, email, password_hash, email_verified)
            values (?, 'incomplete_signup', lower(?), ?, true)
            """, id, email, passwordHash);
        return new AuthUser(
            id, null, UserRole.INCOMPLETE_SIGNUP, email.toLowerCase(), null,
            passwordHash, true, false, true, false);
    }

    public AuthUser createProfessionalSignup(String email, String passwordHash, String fullName) {
        UUID userId = UUID.randomUUID();
        UUID providerId = UUID.randomUUID();
        String baseSlug = fullName.trim().toLowerCase(java.util.Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (baseSlug.isBlank()) baseSlug = "dentist";
        String slug = baseSlug.substring(0, Math.min(baseSlug.length(), 140))
            + "-" + providerId.toString().substring(0, 8);
        jdbcTemplate.update("""
            insert into users (id, role, email, password_hash, email_verified)
            values (?, 'dentist', lower(?), ?, true)
            """, userId, email, passwordHash);
        jdbcTemplate.update("""
            insert into providers (id, user_id, slug, full_name)
            values (?, ?, ?, ?)
            """, providerId, userId, slug, fullName.trim());
        jdbcTemplate.update("insert into provider_marketplace_listings (provider_id) values (?)", providerId);
        return new AuthUser(
            userId, null, UserRole.DENTIST, email.toLowerCase(), null,
            passwordHash, true, false, true, false);
    }

    private static AuthUser mapUser(ResultSet resultSet, int rowNumber) throws SQLException {
        return new AuthUser(
            resultSet.getObject("id", java.util.UUID.class),
            resultSet.getObject("clinic_id", java.util.UUID.class),
            UserRole.fromDatabase(resultSet.getString("role")),
            resultSet.getString("email"),
            resultSet.getString("phone_e164"),
            resultSet.getString("password_hash"),
            resultSet.getBoolean("email_verified"),
            resultSet.getBoolean("phone_verified"),
            resultSet.getBoolean("enabled"),
            resultSet.getBoolean("password_migration_required"));
    }
}
