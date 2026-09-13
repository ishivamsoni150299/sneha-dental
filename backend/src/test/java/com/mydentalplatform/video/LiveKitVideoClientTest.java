package com.mydentalplatform.video;

import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LiveKitVideoClientTest {
    final String secret = "test-only-livekit-key-32-characters-long";
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final HttpClient http = mock(HttpClient.class);
    final LiveKitVideoClient client = new LiveKitVideoClient("wss://video.example.com", "operator-key", secret, new ObjectMapper(), jdbc, http);
    final String room = "mdp-0123456789abcdef0123456789abcdef-1800000000";

    @Test void issuesShortLivedRoomScopedTokensWithoutAdminOrRecordingGrants() {
        Instant now = Instant.now();
        String token = client.joinToken(room, now.minusSeconds(60), now.plusSeconds(3600), false);
        var decoded = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")).build().decode(token);
        assertEquals("patient", decoded.getSubject());
        assertEquals("operator-key", decoded.getClaimAsString("iss"));
        Map<String, Object> grant = decoded.getClaim("video");
        assertEquals(room, grant.get("room"));
        assertEquals(true, grant.get("roomJoin"));
        assertEquals(false, grant.get("canPublishData"));
        assertEquals(List.of("camera", "microphone"), grant.get("canPublishSources"));
        assertFalse(grant.containsKey("roomAdmin"));
        assertFalse(grant.containsKey("roomRecord"));
        assertFalse(grant.containsKey("roomCreate"));
        assertTrue(decoded.getExpiresAt().isBefore(now.plusSeconds(121)));
        var host = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")).build()
            .decode(client.joinToken(room, now.minusSeconds(60), now.plusSeconds(30), true));
        assertEquals("dentist", host.getSubject());
        assertTrue(host.getExpiresAt().isBefore(now.plusSeconds(31)));
    }
    @Test void rejectsInsecureOrMalformedMediaEndpointsAndWeakSecrets() {
        for (String url : List.of("http://video.example.com", "ws://video.example.com", "wss://name:pass@video.example.com", "wss://video.example.com/path", "wss://video.example.com?token=bad"))
            assertFalse(new LiveKitVideoClient(url, "key", secret, new ObjectMapper(), jdbc, http).configured());
        assertFalse(new LiveKitVideoClient("wss://video.example.com", "key", "short", new ObjectMapper(), jdbc, http).configured());
        assertTrue(client.configured());
    }
    @Test void neverIssuesSessionWhenRoomCreationFails() throws Exception {
        HttpResponse<Void> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(503);
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        assertThrows(ResponseStatusException.class, () -> client.createSession(room, Instant.now().minusSeconds(10), Instant.now().plusSeconds(3600), true));
    }
    @Test void createsTwoPersonRoomAndDurableLeaseBeforeReturningSession() throws Exception {
        HttpResponse<Void> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        var session = client.createSession(room, Instant.now().minusSeconds(10), Instant.now().plusSeconds(3600), true);
        assertEquals("livekit", session.provider());
        assertEquals("wss://video.example.com", session.url());
        var request = org.mockito.ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals("https://video.example.com/twirp/livekit.RoomService/CreateRoom", request.getValue().uri().toString());
        verify(jdbc).update(contains("INSERT INTO video_room_leases"), eq(room), any(), isNull(), any(), any());
    }
    @Test void refusesExpiredAndNotYetOpenRoomsBeforeCallingServer() {
        assertThrows(ResponseStatusException.class, () -> client.createSession(room, Instant.now().minusSeconds(90), Instant.now().minusSeconds(1), true));
        assertThrows(ResponseStatusException.class, () -> client.createSession(room, Instant.now().plusSeconds(90), Instant.now().plusSeconds(3600), true));
        verifyNoInteractions(http, jdbc);
    }
    @Test void retriesFailedCleanupWithoutLosingTheLease() throws Exception {
        when(jdbc.queryForList(anyString(), eq(String.class))).thenReturn(List.of(room));
        HttpResponse<Void> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(503, 200);
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        client.closeInvalidRooms();
        verify(jdbc, never()).update(anyString(), eq(room));
        client.closeInvalidRooms();
        verify(jdbc).update("DELETE FROM video_room_leases WHERE room_name = ?", room);
    }
}
