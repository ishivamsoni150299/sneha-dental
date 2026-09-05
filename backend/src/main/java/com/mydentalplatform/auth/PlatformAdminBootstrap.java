package com.mydentalplatform.auth;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PlatformAdminBootstrap implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(PlatformAdminBootstrap.class);

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;

    public PlatformAdminBootstrap(
        JdbcTemplate jdbcTemplate,
        PasswordEncoder passwordEncoder,
        @Value("${platform.bootstrap-admin.email:}") String email,
        @Value("${platform.bootstrap-admin.password:}") String password
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.email = email.trim().toLowerCase();
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        if (email.isBlank() && password.isBlank()) return;
        if (email.isBlank() || password.length() < 12 || password.length() > 72) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set; password length must be 12-72.");
        }
        List<UUID> existing = jdbcTemplate.queryForList(
            "select id from users where lower(email) = ? for update", UUID.class, email);
        String hash = passwordEncoder.encode(password);
        if (existing.isEmpty()) {
            jdbcTemplate.update("""
                insert into users (role, email, password_hash, email_verified)
                values ('platform_admin', ?, ?, true)
                """, email, hash);
            LOG.info("Created bootstrap platform administrator {}", email);
            return;
        }
        jdbcTemplate.update("""
            update users set clinic_id = null, role = 'platform_admin', password_hash = ?,
                email_verified = true, enabled = true, password_migration_required = false, updated_at = now()
            where id = ?
            """, hash, existing.getFirst());
        LOG.info("Updated bootstrap platform administrator {}", email);
    }
}