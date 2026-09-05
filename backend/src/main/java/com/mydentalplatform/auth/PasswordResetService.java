package com.mydentalplatform.auth;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;

@Service
public class PasswordResetService {
    private static final Logger LOG = LoggerFactory.getLogger(PasswordResetService.class);
    private static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    private static final Duration REQUEST_COOLDOWN = Duration.ofMinutes(5);

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Clock clock;
    private final String resendApiKey;
    private final String emailFrom;
    private final String publicBaseUrl;

    public PasswordResetService(
        JdbcTemplate jdbcTemplate,
        PasswordEncoder passwordEncoder,
        ObjectMapper objectMapper,
        @Value("${platform.email.resend-api-key:}") String resendApiKey,
        @Value("${platform.email.from:onboarding@resend.dev}") String emailFrom,
        @Value("${platform.public-base-url:http://localhost:4200}") String publicBaseUrl
    ) {
        this(jdbcTemplate, passwordEncoder, objectMapper, HttpClient.newHttpClient(), Clock.systemUTC(),
            resendApiKey, emailFrom, publicBaseUrl);
    }

    PasswordResetService(
        JdbcTemplate jdbcTemplate,
        PasswordEncoder passwordEncoder,
        ObjectMapper objectMapper,
        HttpClient httpClient,
        Clock clock,
        String resendApiKey,
        String emailFrom,
        String publicBaseUrl
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.clock = clock;
        this.resendApiKey = resendApiKey;
        this.emailFrom = emailFrom;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    public void request(String rawEmail) {
        String email = rawEmail.trim().toLowerCase();
        if (resendApiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Password email delivery is not configured.");
        }
        List<UUID> users = jdbcTemplate.query("""
            select id from users where lower(email) = ? and enabled = true
            """, (resultSet, row) -> resultSet.getObject("id", UUID.class), email);
        if (users.isEmpty() || recentlyRequested(email)) return;

        String token = newToken();
        Instant now = clock.instant();
        jdbcTemplate.update("""
            update auth_challenges set consumed_at = ?
            where destination = ? and purpose = 'password_reset' and consumed_at is null
            """, now, email);
        jdbcTemplate.update("""
            insert into auth_challenges (user_id, purpose, destination, secret_hash, expires_at)
            values (?, 'password_reset', ?, ?, ?)
            """, users.getFirst(), email, hash(token), now.plus(TOKEN_TTL));
        sendResetEmail(email, token);
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

    private boolean recentlyRequested(String email) {
        Integer count = jdbcTemplate.queryForObject("""
            select count(*) from auth_challenges
            where destination = ? and purpose = 'password_reset' and created_at > ?
            """, Integer.class, email, clock.instant().minus(REQUEST_COOLDOWN));
        return count != null && count > 0;
    }

    private void sendResetEmail(String email, String token) {
        String url = publicBaseUrl + "/business/reset-password?email="
            + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&token="
            + URLEncoder.encode(token, StandardCharsets.UTF_8);
        String html = "<p>A password reset was requested for your mydentalplatform account.</p>"
            + "<p><a href=\"" + url + "\">Reset your password</a></p>"
            + "<p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>";
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                "from", emailFrom,
                "to", List.of(email),
                "subject", "Reset your mydentalplatform password",
                "html", html));
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + resendApiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                LOG.error("Password reset email provider returned status {}", response.statusCode());
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            LOG.error("Password reset email delivery was interrupted", error);
        } catch (Exception error) {
            LOG.error("Password reset email delivery failed", error);
        }
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
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