package com.mydentalplatform.video;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.regex.Pattern;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Supports LiveKit Cloud and operator-hosted servers. Credentials and room tokens stay server-side/in memory. */
@Component
@ConditionalOnProperty(name = "VIDEO_PROVIDER", havingValue = "livekit")
public class LiveKitVideoClient implements VideoRoomClient {
    private static final Pattern ROOM = Pattern.compile("mdp-(test-)?([0-9a-f]{32})-([0-9]+)");
    private final String url;
    private final String apiKey;
    private final String secret;
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    private final HttpClient http;

    @org.springframework.beans.factory.annotation.Autowired
    public LiveKitVideoClient(@Value("${LIVEKIT_URL:}") String url, @Value("${LIVEKIT_API_KEY:}") String key,
            @Value("${LIVEKIT_API_SECRET:}") String secret, ObjectMapper mapper, JdbcTemplate jdbc) {
        this(url, key, secret, mapper, jdbc, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }

    LiveKitVideoClient(String url, String key, String secret, ObjectMapper mapper, JdbcTemplate jdbc, HttpClient http) {
        this.url = url.trim().replaceAll("/+$", ""); this.apiKey = key.trim(); this.secret = secret;
        this.mapper = mapper; this.jdbc = jdbc; this.http = http;
    }

    public boolean configured() {
        try {
            URI uri = URI.create(url);
            return "wss".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null
                && uri.getQuery() == null && uri.getFragment() == null && uri.getPath().isEmpty()
                && !apiKey.isBlank() && secret.getBytes(StandardCharsets.UTF_8).length >= 32;
        } catch (IllegalArgumentException error) { return false; }
    }

    public Session createSession(String name, Instant opens, Instant expires, boolean host) {
        if (!configured() || Instant.now().isBefore(opens) || !Instant.now().isBefore(expires)) throw unavailable();
        var match = ROOM.matcher(name);
        if (!match.matches()) throw unavailable();
        String id = match.group(2);
        UUID owner = UUID.fromString(id.substring(0,8)+"-"+id.substring(8,12)+"-"+id.substring(12,16)+"-"+id.substring(16,20)+"-"+id.substring(20));
        boolean test = match.group(1) != null;
        // Keep the lease even if CreateRoom times out: cleanup can then remove a room that was created remotely.
        jdbc.update("""
            INSERT INTO video_room_leases(room_name, appointment_id, dentist_user_id, scheduled_at, expires_at)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT (room_name) DO NOTHING
            """, name, test ? null : owner, test ? owner : null,
            test ? null : java.sql.Timestamp.from(opens.plusSeconds(600)), java.sql.Timestamp.from(expires));
        request("CreateRoom", Map.of("name", name, "max_participants", 2, "empty_timeout", 300, "departure_timeout", 60),
            Map.of("roomCreate", true));
        return new Session(url, joinToken(name, opens, expires, host), expires.toString(), "livekit");
    }

    String joinToken(String room, Instant opens, Instant expires, boolean host) {
        return token(Map.of("room", room, "roomJoin", true, "canPublish", true, "canSubscribe", true,
            "canPublishData", false, "canUpdateOwnMetadata", false, "canPublishSources", List.of("camera", "microphone")),
            host ? "dentist" : "patient", cloudHosted() ? Instant.now() : opens,
            expires.isBefore(Instant.now().plusSeconds(120)) ? expires : Instant.now().plusSeconds(120));
    }

    private boolean cloudHosted() { return URI.create(url).getHost().endsWith(".livekit.cloud"); }

    private String token(Map<String, Object> grant, String identity, Instant opens, Instant expires) {
        var encoder = NimbusJwtEncoder.withSecretKey(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
            .algorithm(MacAlgorithm.HS256).build();
        var claims = JwtClaimsSet.builder().issuer(apiKey).subject(identity).issuedAt(Instant.now())
            .notBefore(opens).expiresAt(expires).claim("video", grant).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private void request(String method, Map<String, Object> body, Map<String, Object> grant) {
        try {
            var request = HttpRequest.newBuilder(URI.create("https" + url.substring(3) + "/twirp/livekit.RoomService/" + method))
                .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token(grant, "room-service", Instant.now().minusSeconds(5), Instant.now().plusSeconds(60)))
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build();
            var response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 != 2 && !(method.equals("DeleteRoom") && response.statusCode() == 404)) throw unavailable();
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (Exception error) { throw unavailable(); }
    }

    @Scheduled(fixedDelay = 15000)
    public void closeInvalidRooms() {
        if (!configured()) return;
        var names = jdbc.queryForList("""
            SELECT v.room_name FROM video_room_leases v
            LEFT JOIN appointments a ON a.id = v.appointment_id
            WHERE v.expires_at <= now()
               OR (v.appointment_id IS NOT NULL AND (a.id IS NULL OR a.consultation_mode <> 'video'
                   OR a.status::text NOT IN ('confirmed', 'checked_in')
                   OR (a.appointment_date + a.appointment_time) AT TIME ZONE 'Asia/Kolkata' <> v.scheduled_at))
               OR (v.dentist_user_id IS NOT NULL AND NOT EXISTS (
                   SELECT 1 FROM providers p JOIN users u ON u.id = p.user_id
                   WHERE p.user_id = v.dentist_user_id AND p.active AND p.verification_status = 'verified' AND u.enabled))
            LIMIT 100
            """, String.class);
        for (String name : names) {
            try {
                if (cloudHosted()) {
                    // Cloud can auto-create rooms. Revoke both identities, including departed or never-joined callers,
                    // before deleting the room so cached/refreshed tokens cannot reopen it.
                    for (String identity : List.of("dentist", "patient")) {
                        request("RemoveParticipant", Map.of("room", name, "identity", identity,
                            "revoke_token_ts", Instant.now().plusSeconds(1).getEpochSecond()),
                            Map.of("roomAdmin", true, "room", name));
                    }
                }
                request("DeleteRoom", Map.of("room", name), Map.of("roomCreate", true));
                jdbc.update("DELETE FROM video_room_leases WHERE room_name = ?", name);
            } catch (ResponseStatusException error) {
                // Retry next cycle. Do not log provider responses or credentials.
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Video room cleanup failed; will retry");
            }
        }
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "The video room is unavailable. Please try again shortly or contact the clinic.");
    }
}
