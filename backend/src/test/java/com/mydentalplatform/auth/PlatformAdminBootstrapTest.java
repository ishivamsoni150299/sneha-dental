package com.mydentalplatform.auth;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PlatformAdminBootstrapTest {
    @Test
    void restartDoesNotResetExistingPasswordOrPromoteAnExistingAccount() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(jdbc.queryForList(anyString(), eq(UUID.class), eq("owner@example.com")))
            .thenReturn(List.of(UUID.randomUUID()));
        new PlatformAdminBootstrap(jdbc, encoder, "owner@example.com", "initial-password").run(null);
        verifyNoInteractions(encoder);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
