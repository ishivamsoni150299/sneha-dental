package com.mydentalplatform.video;

import java.net.http.*;
import java.time.Instant;
import java.nio.ByteBuffer;
import java.util.concurrent.Flow;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class DailyVideoClientTest {
    private final ObjectMapper mapper = new ObjectMapper();
    @SuppressWarnings("unchecked")
    private HttpResponse<String> response(int status, String body) {
        var response = (HttpResponse<String>) mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status); when(response.body()).thenReturn(body);
        return response;
    }

    @Test void createsPrivateRoomAndShortLivedRoomScopedPatientToken() throws Exception {
        var http = mock(HttpClient.class);
        var missing = response(404, "{}");
        var privateRoom = response(200, "{\"privacy\":\"private\",\"url\":\"https://example.daily.co/room\"}");
        var meetingToken = response(200, "{\"token\":\"test-meeting-token\"}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(missing, privateRoom, meetingToken);
        Instant now = Instant.now(), expires = now.plusSeconds(3600);
        var session = new DailyVideoClient("test-server-key", mapper, http).createSession("room", now.minusSeconds(600), expires, false);
        assertEquals("test-meeting-token", session.token());
        var requests = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http, times(3)).send(requests.capture(), any(HttpResponse.BodyHandler.class));
        var room = mapper.readTree(body(requests.getAllValues().get(1)));
        assertEquals("private", room.path("privacy").asText());
        assertEquals(2, room.path("properties").path("max_participants").asInt());
        assertFalse(room.path("properties").path("enable_knocking").asBoolean());
        assertTrue(room.path("properties").path("eject_at_room_exp").asBoolean());
        var token = mapper.readTree(body(requests.getAllValues().get(2))).path("properties");
        assertEquals("room", token.path("room_name").asText());
        assertFalse(token.path("is_owner").asBoolean());
        assertFalse(token.path("enable_recording_ui").asBoolean());
        assertTrue(token.path("exp").asLong() <= Instant.now().plusSeconds(120).getEpochSecond());
    }

    @Test void refusesPublicRoomsAndProviderFailuresWithoutLeakingSecrets() throws Exception {
        var http = mock(HttpClient.class);
        var publicRoom = response(200, "{\"privacy\":\"public\",\"url\":\"https://example.daily.co/room\"}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(publicRoom);
        var client = new DailyVideoClient("secret-server-key", mapper, http);
        var error = assertThrows(ResponseStatusException.class,
            () -> client.createSession("room", Instant.now(), Instant.now().plusSeconds(3600), true));
        assertEquals(503, error.getStatusCode().value());
        assertFalse(error.getMessage().contains("secret-server-key"));
        verify(http, times(1)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    private String body(HttpRequest request) {
        var result = new CompletableFuture<String>();
        var bytes = new java.io.ByteArrayOutputStream();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            public void onNext(ByteBuffer buffer) { byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk); }
            public void onError(Throwable error) { result.completeExceptionally(error); }
            public void onComplete() { result.complete(bytes.toString(java.nio.charset.StandardCharsets.UTF_8)); }
        });
        return result.join();
    }
}
