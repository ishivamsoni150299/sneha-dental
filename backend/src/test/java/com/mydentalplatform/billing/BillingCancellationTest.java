package com.mydentalplatform.billing;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BillingCancellationTest {
    private Jwt token(UUID clinic, String role) {
        return Jwt.withTokenValue("test").header("alg", "HS256").subject(UUID.randomUUID().toString())
            .claim("role", role).claim("clinic_id", clinic.toString()).build();
    }

    private BillingController controller(JdbcTemplate jdbc, HttpClient http) {
        return new BillingController(jdbc, new ObjectMapper(), "key", "secret", "webhook", "plan_basic", "plan_pro", "", http);
    }

    @Test void configuredRazorpayCannotUseImplicitPlanIds() {
        assertThrows(IllegalStateException.class, () -> new BillingController(mock(JdbcTemplate.class),
            new ObjectMapper(), "key", "secret", "webhook", "", "", "", mock(HttpClient.class)));
    }

    @Test void onlyOwningClinicCanCancel() {
        var jdbc = mock(JdbcTemplate.class);
        var http = mock(HttpClient.class);
        UUID clinic = UUID.randomUUID();
        var error = assertThrows(ResponseStatusException.class,
            () -> controller(jdbc, http).cancel(token(clinic, "patient"), "sub_123"));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verifyNoInteractions(jdbc, http);
    }

    @Test void repeatedRequestReturnsScheduledDateWithoutCallingProvider() {
        var jdbc = mock(JdbcTemplate.class);
        var http = mock(HttpClient.class);
        UUID clinic = UUID.randomUUID();
        when(jdbc.queryForList(contains("for update"), eq(clinic))).thenReturn(List.of(Map.of(
            "razorpay_subscription_id", "sub_123", "cancellation_effective_at", "2026-10-01T00:00:00Z")));
        var result = controller(jdbc, http).cancel(token(clinic, "clinic-admin"), "sub_123");
        assertEquals("scheduled", result.get("status"));
        verifyNoInteractions(http);
    }

    @Test void providerFailureDoesNotRecordCancellation() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var http = mock(HttpClient.class);
        @SuppressWarnings("unchecked") HttpResponse<String> response = mock(HttpResponse.class);
        UUID clinic = UUID.randomUUID();
        when(jdbc.queryForList(contains("for update"), eq(clinic))).thenReturn(List.of(Map.of(
            "razorpay_subscription_id", "sub_123")));
        when(response.statusCode()).thenReturn(503);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        assertThrows(ResponseStatusException.class,
            () -> controller(jdbc, http).cancel(token(clinic, "clinic-admin"), "sub_123"));
        verify(jdbc, never()).update(contains("cancellationRequestedAt"), any(), any(), any());
    }

    @Test void successfulCancellationIsScheduledAtProviderCycleEnd() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var http = mock(HttpClient.class);
        @SuppressWarnings("unchecked") HttpResponse<String> response = mock(HttpResponse.class);
        UUID clinic = UUID.randomUUID();
        when(jdbc.queryForList(contains("for update"), eq(clinic))).thenReturn(List.of(Map.of(
            "razorpay_subscription_id", "sub_123")));
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"id\":\"sub_123\",\"current_end\":1790812800}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        var result = controller(jdbc, http).cancel(token(clinic, "clinic-admin"), "sub_123");
        assertEquals("scheduled", result.get("status"));
        assertEquals("2026-10-01T00:00:00Z", result.get("effectiveAt"));
        var request = org.mockito.ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals("https://api.razorpay.com/v1/subscriptions/sub_123/cancel", request.getValue().uri().toString());
        verify(jdbc).update(contains("cancellationRequestedAt"), eq("2026-10-01T00:00:00Z"), eq(clinic), eq("sub_123"));
    }

    @Test void invalidWebhookSignatureDoesNotMutateBilling() {
        var jdbc = mock(JdbcTemplate.class);
        var error = assertThrows(ResponseStatusException.class,
            () -> controller(jdbc, mock(HttpClient.class)).webhook("invalid", "event-1", "{}"));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(jdbc);
    }

    @Test void duplicateWebhookDoesNotApplyPlanTwice() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        UUID clinic = UUID.randomUUID();
        String body = webhookBody("subscription.activated", clinic);
        when(jdbc.update(contains("insert into webhook_events"), any(), any(), eq(clinic), any())).thenReturn(0);
        var result = controller(jdbc, mock(HttpClient.class)).webhook(signature(body), "event-1", body);
        assertEquals(true, result.getBody().get("duplicate"));
        verify(jdbc, never()).update(contains("update clinics set subscription_plan"), any(), any(), any());
    }

    @Test void activationWebhookUpdatesOnlyNotedClinic() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        UUID clinic = UUID.randomUUID();
        String body = webhookBody("subscription.activated", clinic);
        when(jdbc.update(contains("insert into webhook_events"), any(), any(), eq(clinic), any())).thenReturn(1);
        controller(jdbc, mock(HttpClient.class)).webhook(signature(body), "event-2", body);
        verify(jdbc).update(contains("update clinics set subscription_plan"), eq("starter"), eq("active"), eq(clinic));
        verify(jdbc).update(contains("insert into clinic_private_accounts"), eq(clinic), eq("active"), eq("sub_123"), eq("monthly"), eq("active"), eq("sub_123"));
    }

    private String webhookBody(String event, UUID clinic) {
        return "{\"event\":\"" + event + "\",\"payload\":{\"subscription\":{\"entity\":{\"id\":\"sub_123\",\"notes\":{\"clinicId\":\""
            + clinic + "\",\"plan\":\"starter\",\"billingCycle\":\"monthly\"}}}}}";
    }

    private String signature(String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("webhook".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }
}
