package com.mydentalplatform.video;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Server-only Daily API adapter. Room tokens are never persisted or logged. */
@Component
public class DailyVideoClient {
    private final String apiKey;
    private final ObjectMapper mapper;
    private final HttpClient http;

    @org.springframework.beans.factory.annotation.Autowired
    public DailyVideoClient(@Value("${DAILY_API_KEY:}") String apiKey, ObjectMapper mapper) {
        this(apiKey, mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }

    DailyVideoClient(String apiKey, ObjectMapper mapper, HttpClient http) {
        this.apiKey = apiKey.trim();
        this.mapper = mapper;
        this.http = http;
    }

    public boolean configured() { return !apiKey.isEmpty(); }

    public Session createSession(String roomName, Instant opens, Instant expires, boolean host) {
        if (!configured()) throw unavailable();
        try {
            var room = call("GET", "/rooms/" + roomName, null);
            if (room.statusCode() == 404) {
                room = call("POST", "/rooms", Map.of("name", roomName, "privacy", "private",
                    "properties", Map.of("nbf", opens.getEpochSecond(), "exp", expires.getEpochSecond(),
                        "max_participants", 2, "enable_prejoin_ui", true, "enable_knocking", false,
                        "enable_chat", false, "enable_screenshare", false,
                        "eject_at_room_exp", true, "enforce_unique_user_ids", true)));
                // Two callers can create the same appointment room concurrently.
                if (room.statusCode() == 400 || room.statusCode() == 409) {
                    room = call("GET", "/rooms/" + roomName, null);
                }
            }
            if (room.statusCode() / 100 != 2) throw unavailable();
            var roomData = mapper.readTree(room.body());
            if (!"private".equals(roomData.path("privacy").asText())) throw unavailable();
            String url = roomData.path("url").asText();
            URI uri = URI.create(url);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null ||
                !uri.getHost().endsWith(".daily.co") || uri.getUserInfo() != null || uri.getPort() != -1) {
                throw unavailable();
            }
            var token = call("POST", "/meeting-tokens", Map.of("properties", Map.of(
                "room_name", roomName, "nbf", opens.getEpochSecond(),
                "exp", Math.min(Instant.now().plusSeconds(120).getEpochSecond(), expires.getEpochSecond()),
                "is_owner", host, "user_id", host ? "dentist" : "patient",
                "user_name", host ? "Dentist" : "Patient", "enable_recording_ui", false,
                "eject_at_token_exp", false)));
            if (token.statusCode() / 100 != 2) throw unavailable();
            String value = mapper.readTree(token.body()).path("token").asText();
            if (value.isBlank()) throw unavailable();
            return new Session(url, value, expires.toString());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception error) {
            // Provider responses can contain credentials. Do not expose or log them.
            throw unavailable();
        }
    }

    private HttpResponse<String> call(String method, String path, Object payload) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("https://api.daily.co/v1" + path))
            .timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json");
        builder.method(method, payload == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Video consultations are temporarily unavailable. Please contact the clinic or try again.");
    }

    public record Session(String url, String token, String expiresAt) {}
}
