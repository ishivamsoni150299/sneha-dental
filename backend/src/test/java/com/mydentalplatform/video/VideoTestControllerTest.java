package com.mydentalplatform.video;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class VideoTestControllerTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final DailyVideoClient daily = mock(DailyVideoClient.class);
    final VideoTestController controller = new VideoTestController(jdbc, daily, "test-only-secret-with-at-least-32-bytes");
    final UUID user = UUID.randomUUID();
    Jwt jwt(String role) { return Jwt.withTokenValue("test").header("alg", "HS256").subject(user.toString()).claim("role", role).build(); }

    @Test void rejectsNonDentistsAndUnverifiedProfiles() {
        assertThrows(ResponseStatusException.class, () -> controller.start(jwt("patient")));
        assertThrows(ResponseStatusException.class, () -> controller.start(jwt("dentist")));
        verifyNoInteractions(daily);
    }
    @Test void hostAndGuestUseSamePrivateRoomWithDifferentPrivileges() {
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(user))).thenReturn(true);
        when(daily.createSession(anyString(), any(), any(), anyBoolean()))
            .thenReturn(new DailyVideoClient.Session("https://test.daily.co/private", "test-token", Instant.now().plusSeconds(3600).toString()));
        Map<String, Object> result = controller.start(jwt("dentist")).getBody();
        assertNotNull(result);
        String token = (String) result.get("guestToken");
        controller.guest(Map.of("token", token));
        var room = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(daily).createSession(room.capture(), any(), any(), eq(true));
        verify(daily).createSession(eq(room.getValue()), any(), any(), eq(false));
        assertTrue(room.getValue().startsWith("mdp-test-"));
        assertThrows(ResponseStatusException.class, () -> controller.guest(Map.of("token", token + "tampered")));
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(user))).thenReturn(false);
        assertThrows(ResponseStatusException.class, () -> controller.guest(Map.of("token", token)));
    }
    @Test void invalidAndOversizedTokensNeverReachVideoProvider() {
        for (String token : new String[] {"", "invalid", "x".repeat(181), user + ".1.invalid-signature"})
            assertThrows(ResponseStatusException.class, () -> controller.guest(Map.of("token", token)));
        verifyNoInteractions(daily);
    }
}
