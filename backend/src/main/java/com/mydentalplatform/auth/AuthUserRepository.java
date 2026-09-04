package com.mydentalplatform.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

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