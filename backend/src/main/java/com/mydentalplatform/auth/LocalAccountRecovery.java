package com.mydentalplatform.auth;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Explicit server-operator recovery; never exposed as an HTTP endpoint. */
@Component
public class LocalAccountRecovery implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final String requestId, email, password;

    public LocalAccountRecovery(JdbcTemplate jdbc, PasswordEncoder encoder,
        @Value("${AUTH_RECOVERY_ID:}") String requestId,
        @Value("${AUTH_RECOVERY_EMAIL:}") String email,
        @Value("${AUTH_RECOVERY_PASSWORD:}") String password) {
        this.jdbc = jdbc; this.encoder = encoder;
        this.requestId = requestId; this.email = email.trim().toLowerCase(java.util.Locale.ROOT); this.password = password;
    }

    @Override @Transactional
    public void run(ApplicationArguments args) {
        if (requestId.isBlank() && email.isBlank() && password.isBlank()) return;
        if (requestId.isBlank() || email.isBlank() || password.length() < 12 ||
            password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
            throw new IllegalStateException("Set AUTH_RECOVERY_ID (UUID), AUTH_RECOVERY_EMAIL and AUTH_RECOVERY_PASSWORD (12-72 bytes), then remove them after recovery.");
        UUID id = UUID.fromString(requestId);
        jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", id.toString());
        if (Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from auth_operator_recoveries where request_id = ?)", Boolean.class, id))) return;
        var users = jdbc.queryForList("select id from users where lower(email) = ? and enabled and role <> 'patient' for update", UUID.class, email);
        if (users.size() != 1) throw new IllegalStateException("Recovery requires one existing enabled email account.");
        UUID userId = users.getFirst();
        jdbc.update("update users set password_hash = ?, password_migration_required = false, updated_at = now() where id = ?", encoder.encode(password), userId);
        jdbc.update("update refresh_tokens set revoked_at = now() where user_id = ? and revoked_at is null", userId);
        jdbc.update("update auth_challenges set consumed_at = now() where user_id = ? and consumed_at is null", userId);
        jdbc.update("insert into auth_operator_recoveries(request_id, user_id) values (?, ?)", id, userId);
    }
}
