package com.mydentalplatform.auth;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Uses only the publishable key. Provider tokens and OTPs never leave this adapter. */
@Component
public class SupabaseOtpClient {
    private final String url;
    private final String key;
    private final String publicBaseUrl;
    private final ObjectMapper mapper;
    private final HttpClient http;

    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseOtpClient(ObjectMapper mapper,
        @Value("${SUPABASE_URL:https://bzdhowtdayekdusfpmbw.supabase.co}") String url,
        @Value("${SUPABASE_PUBLISHABLE_KEY:}") String key,
        @Value("${platform.public-base-url:https://mydentalplatform.com}") String publicBaseUrl) {
        this(mapper, url, key, publicBaseUrl, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }

    SupabaseOtpClient(ObjectMapper mapper, String url, String key, String publicBaseUrl, HttpClient http) {
        URI origin = URI.create(url);
        if (!"https".equals(origin.getScheme()) || origin.getHost() == null || !origin.getHost().endsWith(".supabase.co")
            || origin.getUserInfo() != null || origin.getPort() != -1 || origin.getQuery() != null)
            throw new IllegalArgumentException("Use the HTTPS Supabase project URL.");
        this.url = url.replaceAll("/+$", "");
        this.key = key;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
        this.mapper = mapper;
        this.http = http;
    }

    public void send(String identity, boolean phone, String redirectPath) {
        String path = phone ? "/otp" : "/otp?redirect_to=" + java.net.URLEncoder.encode(
            publicBaseUrl + redirectPath, java.nio.charset.StandardCharsets.UTF_8);
        call(path, otpPayload(identity, phone, redirectPath), false);
    }

    Map<String, Object> otpPayload(String identity, boolean phone, String redirectPath) {
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put(phone ? "phone" : "email", identity);
        payload.put("create_user", true);
        return payload;
    }

    public Identity verify(String identity, boolean phone, String code) {
        var body = call("/verify", Map.of(phone ? "phone" : "email", identity, "token", code,
            "type", phone ? "sms" : "email"), true);
        return confirmedIdentity(body, identity, phone);
    }

    public Identity verifyAccessToken(String accessToken) {
        try {
            if (key == null || key.isBlank()) throw unavailable();
            var request = HttpRequest.newBuilder(URI.create(url + "/auth/v1/user"))
                .timeout(Duration.ofSeconds(15)).header("apikey", key)
                .header("Authorization", "Bearer " + accessToken).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) throw invalid();
            if (response.statusCode() / 100 != 2) throw unavailable();
            var body = mapper.readTree(response.body());
            var wrapped = mapper.createObjectNode();
            wrapped.set("user", body);
            return confirmedIdentity(wrapped, body.path("email").asText(""), false);
        } catch (ResponseStatusException error) { throw error; }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (Exception error) { throw unavailable(); }
    }

    private Identity confirmedIdentity(tools.jackson.databind.JsonNode body, String identity, boolean phone) {
        var user = body.path("user");
        String confirmed = user.path(phone ? "phone_confirmed_at" : "email_confirmed_at").asText("");
        String actual = user.path(phone ? "phone" : "email").asText("");
        if (phone && !actual.startsWith("+")) actual = "+" + actual;
        if (confirmed.isBlank() || !identity.equalsIgnoreCase(actual) || user.path("is_anonymous").asBoolean(false))
            throw invalid();
        try { return new Identity(UUID.fromString(user.path("id").asText()), identity, phone); }
        catch (IllegalArgumentException error) { throw invalid(); }
    }

    private tools.jackson.databind.JsonNode call(String path, Object payload, boolean verify) {
        try {
            if (key == null || key.isBlank()) throw unavailable();
            var request = HttpRequest.newBuilder(URI.create(url + "/auth/v1" + path))
                .timeout(Duration.ofSeconds(15)).header("apikey", key).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload))).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Please wait before requesting or checking another code.");
            if (response.statusCode() / 100 != 2) {
                if (verify && (response.statusCode() == 400 || response.statusCode() == 403 || response.statusCode() == 422)) throw invalid();
                throw unavailable();
            }
            return mapper.readTree(response.body());
        } catch (ResponseStatusException error) { throw error; }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (Exception error) { throw unavailable(); }
    }

    private ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "That code is incorrect or expired. Request a new code and try again."); }
    private ResponseStatusException unavailable() { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Verification delivery is unavailable. Please try again later or contact support."); }
    public record Identity(UUID providerId, String value, boolean phone) {}
}
