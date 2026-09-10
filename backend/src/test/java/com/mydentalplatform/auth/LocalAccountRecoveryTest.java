package com.mydentalplatform.auth;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LocalAccountRecoveryTest {
    @Test void noConfigurationDoesNothing() {
        var jdbc = mock(JdbcTemplate.class); var encoder = mock(PasswordEncoder.class);
        new LocalAccountRecovery(jdbc, encoder, "", "", "").run(null);
        verifyNoInteractions(jdbc, encoder);
    }
    @Test void completedRequestDoesNotResetPasswordAgain() {
        var jdbc = mock(JdbcTemplate.class); var encoder = mock(PasswordEncoder.class);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(UUID.class))).thenReturn(true);
        new LocalAccountRecovery(jdbc, encoder, UUID.randomUUID().toString(), "owner@example.com", "unique-password").run(null);
        verifyNoInteractions(encoder);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void recoveryRevokesSessionsWithoutChangingRole() {
        var jdbc = mock(JdbcTemplate.class); var encoder = mock(PasswordEncoder.class);
        var user = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(UUID.class))).thenReturn(false);
        when(jdbc.queryForList(contains("select id from users"), eq(UUID.class), eq("owner@example.com"))).thenReturn(List.of(user));
        when(encoder.encode("unique-password")).thenReturn("hashed-password");
        new LocalAccountRecovery(jdbc, encoder, UUID.randomUUID().toString(), "owner@example.com", "unique-password").run(null);
        verify(jdbc).update(contains("set password_hash"), eq("hashed-password"), eq(user));
        verify(jdbc).update(contains("update refresh_tokens"), eq(user));
        verify(jdbc, never()).update(contains("set role"), any(Object[].class));
    }
    @Test void invalidConfigurationIsRejected() {
        assertThrows(IllegalStateException.class, () -> new LocalAccountRecovery(mock(JdbcTemplate.class),
            mock(PasswordEncoder.class), "", "owner@example.com", "short").run(null));
    }
}
