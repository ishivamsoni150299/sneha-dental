package com.mydentalplatform.auth;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RecoveryCodeTest {
    @Test void generationRequiresCurrentPasswordAndStoresOnlyHash() {
        var users = mock(AuthUserRepository.class); var jdbc = mock(JdbcTemplate.class);
        var encoder = mock(PasswordEncoder.class); var tokens = mock(TokenService.class);
        var id = UUID.randomUUID();
        var user = new AuthUser(id, null, UserRole.PATIENT, "patient@example.com", null, "password-hash", false, false, true, false);
        var jwt = Jwt.withTokenValue("test").header("alg", "HS256").subject(id.toString()).claim("email", user.email()).build();
        when(users.findByEmail(user.email())).thenReturn(Optional.of(user));
        var controller = new RecoveryCodeController(users, jdbc, encoder, tokens);
        assertThrows(ResponseStatusException.class, () -> controller.generate(jwt, new RecoveryCodeController.Password("wrong")));
        verifyNoInteractions(jdbc, tokens);
        when(encoder.matches("correct", "password-hash")).thenReturn(true);
        when(tokens.createRefreshToken(any())).thenReturn(new TokenService.RefreshToken("private-code", "code-hash", java.time.Instant.now()));
        when(tokens.hashRefreshToken("private-code")).thenReturn("code-hash");
        assertEquals("private-code", controller.generate(jwt, new RecoveryCodeController.Password("correct")).getBody().get("recoveryCode"));
        verify(jdbc).update(contains("insert into account_recovery_codes"), eq(id), eq("code-hash"));
    }

    @Test void resetConsumesCodeAndRevokesExistingSessionsWithoutChangingIdentity() {
        var jdbc = mock(JdbcTemplate.class); var encoder = mock(PasswordEncoder.class);
        var id = UUID.randomUUID();
        when(jdbc.queryForList(contains("r.consumed_at is null"), eq(UUID.class), eq("patient@example.com"), anyString())).thenReturn(List.of(id));
        when(encoder.encode("new-password")).thenReturn("new-hash");
        new PasswordResetService(jdbc, encoder).complete("PATIENT@example.com", "private-code", "new-password");
        verify(jdbc).update(contains("set password_hash"), eq("new-hash"), eq(id));
        verify(jdbc).update(contains("account_recovery_codes set consumed_at"), eq(id));
        verify(jdbc).update(contains("refresh_tokens set revoked_at"), eq(id));
        verify(jdbc, never()).update(contains("set role"), any(Object[].class));
    }

    @Test void invalidOrConsumedCodeCannotChangePassword() {
        var jdbc = mock(JdbcTemplate.class); var encoder = mock(PasswordEncoder.class);
        assertThrows(ResponseStatusException.class, () -> new PasswordResetService(jdbc, encoder).complete("patient@example.com", "invalid", "new-password"));
        verifyNoInteractions(encoder);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
