package com.mydentalplatform.auth;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class RecoveryCodeController {
    private final AuthUserRepository users;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    public RecoveryCodeController(AuthUserRepository users, JdbcTemplate jdbc, PasswordEncoder encoder, TokenService tokens) {
        this.users = users; this.jdbc = jdbc; this.encoder = encoder; this.tokens = tokens;
    }
    @PostMapping("/api/auth/recovery-code") @Transactional
    public ResponseEntity<Map<String, String>> generate(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Password request) {
        if (jwt == null || jwt.getClaimAsString("email") == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var user = users.findByEmail(jwt.getClaimAsString("email")).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.enabled() || !user.id().toString().equals(jwt.getSubject()) || !encoder.matches(request.password(), user.passwordHash()))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Enter your current password.");
        String code = tokens.createRefreshToken(java.time.Instant.now()).value();
        jdbc.update("""
            insert into account_recovery_codes(user_id, code_hash) values (?, ?)
            on conflict(user_id) do update set code_hash = excluded.code_hash, created_at = now(), consumed_at = null
            """, user.id(), tokens.hashRefreshToken(code));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("recoveryCode", code));
    }
    public record Password(@NotBlank String password) {}
}
