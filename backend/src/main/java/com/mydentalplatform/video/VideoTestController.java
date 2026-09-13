package com.mydentalplatform.video;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Private, expiring two-person equipment checks; never grants access to patient appointments. */
@RestController
@RequestMapping("/api")
public class VideoTestController {
    private final JdbcTemplate jdbc;
    private final VideoRoomClient daily;
    private final byte[] signingKey;
    public VideoTestController(JdbcTemplate jdbc, VideoRoomClient daily, @Value("${platform.auth.secret}") String key) {
        this.jdbc = jdbc; this.daily = daily; this.signingKey = key.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/providers/me/video-test")
    public ResponseEntity<Map<String, Object>> start(@AuthenticationPrincipal Jwt jwt) {
        if (jwt == null || !"dentist".equals(jwt.getClaimAsString("role"))) throw forbidden();
        UUID user = UUID.fromString(jwt.getSubject());
        requireVerified(user);
        // Repeated clicks reuse a private test room instead of creating unlimited rooms.
        long expires = (Instant.now().getEpochSecond() / 1800) * 1800 + 3600;
        String payload = user + "." + expires;
        String token = payload + "." + signature(payload);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
            "session", session(user, expires, true), "guestToken", token,
            "expiresAt", Instant.ofEpochSecond(expires).toString()));
    }

    @PostMapping("/public/video-tests/join")
    public ResponseEntity<VideoRoomClient.Session> guest(@RequestBody Map<String, String> request) {
        String[] parts = invitation(request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(session(UUID.fromString(parts[0]), Long.parseLong(parts[1]), false));
    }

    @PostMapping("/providers/me/video-test/refresh")
    public ResponseEntity<VideoRoomClient.Session> refresh(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> request) {
        if (jwt == null || !"dentist".equals(jwt.getClaimAsString("role"))) throw forbidden();
        String[] parts = invitation(request);
        if (!parts[0].equals(jwt.getSubject())) throw forbidden();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(session(UUID.fromString(parts[0]), Long.parseLong(parts[1]), true));
    }

    private String[] invitation(Map<String, String> request) {
        String token = request.getOrDefault("token", "");
        if (token == null || token.length() > 180) throw forbidden();
        String[] parts = token.split("\\.");
        if (parts.length != 3 || !MessageDigest.isEqual(signature(parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8), parts[2].getBytes(StandardCharsets.UTF_8)))
            throw forbidden();
        try {
            UUID user = UUID.fromString(parts[0]);
            long expires = Long.parseLong(parts[1]);
            long now = Instant.now().getEpochSecond();
            if (expires <= now || expires > now + 3600) throw forbidden();
            requireVerified(user);
            return parts;
        } catch (IllegalArgumentException error) { throw forbidden(); }
    }

    private VideoRoomClient.Session session(UUID user, long expires, boolean host) {
        return daily.createSession("mdp-test-" + user.toString().replace("-", "") + "-" + expires,
            Instant.ofEpochSecond(expires - 3600), Instant.ofEpochSecond(expires), host);
    }
    private void requireVerified(UUID user) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT exists(SELECT 1 FROM providers p JOIN users u ON u.id = p.user_id
                WHERE p.user_id = ? AND p.active AND p.verification_status = 'verified' AND u.enabled)
            """, Boolean.class, user))) throw forbidden();
    }
    private String signature(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(("video-test:" + payload).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException error) { throw new IllegalStateException("Could not create test invitation.", error); }
    }
    private ResponseStatusException forbidden() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "This test invitation is invalid or expired, or the dentist is not verified.");
    }
}
