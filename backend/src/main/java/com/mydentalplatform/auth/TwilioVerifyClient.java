package com.mydentalplatform.auth;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Component
public class TwilioVerifyClient {
    private final String account, token, service;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    public TwilioVerifyClient(@Value("${TWILIO_ACCOUNT_SID:}") String account,
        @Value("${TWILIO_AUTH_TOKEN:}") String token, @Value("${TWILIO_VERIFY_SERVICE_SID:}") String service, ObjectMapper mapper) {
        this.account = account; this.token = token; this.service = service; this.mapper = mapper;
    }
    public boolean available() { return account.matches("AC[0-9a-fA-F]{32}") && !token.isBlank() && service.matches("VA[0-9a-fA-F]{32}"); }
    public void send(String phone) { call("Verifications", "To=" + encode(phone) + "&Channel=sms", false); }
    public void check(String phone, String code) { call("VerificationCheck", "To=" + encode(phone) + "&Code=" + encode(code), true); }
    private void call(String path, String body, boolean check) {
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Mobile verification is temporarily unavailable. Please try again later.");
        try {
            var response = http.send(HttpRequest.newBuilder(URI.create("https://verify.twilio.com/v2/Services/" + service + "/" + path))
                .timeout(Duration.ofSeconds(15)).header("Authorization", "Basic " + Base64.getEncoder().encodeToString((account + ":" + token).getBytes(StandardCharsets.UTF_8)))
                .header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many codes requested. Wait before trying again.");
            if (check && (response.statusCode() == 404 || response.statusCode() == 400)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Code expired or incorrect. Request a new code.");
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "SMS verification could not be completed. Try again later.");
            if (check && !"approved".equals(mapper.readTree(response.body()).path("status").asString()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Incorrect code. Please try again.");
        } catch (ResponseStatusException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "SMS verification interrupted."); }
        catch (Exception e) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "SMS verification is temporarily unavailable."); }
    }
    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
