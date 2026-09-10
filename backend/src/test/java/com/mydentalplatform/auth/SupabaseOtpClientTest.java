package com.mydentalplatform.auth;

import java.net.http.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class SupabaseOtpClientTest {
    private HttpClient lastHttp;
    @SuppressWarnings("unchecked")
    private SupabaseOtpClient client(String body, int status) throws Exception {
        var http = mock(HttpClient.class);
        lastHttp = http;
        var response = (HttpResponse<String>) mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status); when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        return new SupabaseOtpClient(new ObjectMapper(), "https://example.supabase.co", "test-publishable-key", "https://mydentalplatform.com", http);
    }
    @Test void acceptsOnlyConfirmedIdentityReturnedBySupabase() throws Exception {
        var provider = client("""
            {"user":{"id":"78a2fd30-03b3-4fd6-bb0d-74e3700c7d91","email":"owner@example.com","email_confirmed_at":"2026-09-07T10:00:00Z"}}
            """, 200);
        assertEquals("owner@example.com", provider.verify("owner@example.com", false, "123456").value());
        assertThrows(ResponseStatusException.class, () -> provider.verify("attacker@example.com", false, "123456"));
    }
    @Test void refusesUnconfirmedEmailEvenWhenRequestSucceeds() throws Exception {
        var provider = client("{\"user\":{\"id\":\"78a2fd30-03b3-4fd6-bb0d-74e3700c7d91\",\"email\":\"owner@example.com\"}}", 200);
        assertThrows(ResponseStatusException.class, () -> provider.verify("owner@example.com", false, "123456"));
    }
    @Test void verifiesPhoneWithoutTreatingEmailAsPhoneProof() throws Exception {
        var provider = client("""
            {"user":{"id":"78a2fd30-03b3-4fd6-bb0d-74e3700c7d91","phone":"919876543210","phone_confirmed_at":"2026-09-07T10:00:00Z"}}
            """, 200);
        assertTrue(provider.verify("+919876543210", true, "123456").phone());
        assertThrows(ResponseStatusException.class, () -> provider.verify("+919999999999", true, "123456"));
    }
    @Test void acceptsAConfirmedEmailFromMagicLinkAccessToken() throws Exception {
        var provider = client("""
            {"id":"78a2fd30-03b3-4fd6-bb0d-74e3700c7d91","email":"owner@example.com","email_confirmed_at":"2026-09-07T10:00:00Z"}
            """, 200);
        assertEquals("owner@example.com", provider.verifyAccessToken("supabase-access-token").value());
    }
    @Test void sanitizesProviderErrors() throws Exception {
        var provider = client("sensitive-provider-body", 500);
        var error = assertThrows(ResponseStatusException.class, () -> provider.send("owner@example.com", false, "/professional/signup"));
        assertEquals(503, error.getStatusCode().value());
        assertFalse(error.getMessage().contains("sensitive-provider-body"));
    }
    @Test void emailRedirectIsSentAsGoTrueQueryParameterForEveryPortal() throws Exception {
        var provider = client("{}", 200);
        for (String portal : java.util.List.of("clinic", "dentist", "platform")) {
            clearInvocations(lastHttp);
            provider.send("owner@example.com", false, OtpLoginService.redirectPath(portal));
            var captured = org.mockito.ArgumentCaptor.forClass(HttpRequest.class);
            verify(lastHttp).send(captured.capture(), any(HttpResponse.BodyHandler.class));
            assertEquals("/auth/v1/otp", captured.getValue().uri().getPath());
            assertEquals("redirect_to=https://mydentalplatform.com" + OtpLoginService.redirectPath(portal),
                java.net.URLDecoder.decode(captured.getValue().uri().getRawQuery(), java.nio.charset.StandardCharsets.UTF_8));
        }
        assertFalse(provider.otpPayload("owner@example.com", false, "/business/signup").containsKey("options"));
    }

    @Test void phoneOtpPayloadDoesNotCarryEmailRedirect() throws Exception {
        var provider = client("{}", 200);
        var payload = provider.otpPayload("+919876543210", true, "/");

        assertFalse(payload.containsKey("options"));
        provider.send("+919876543210", true, "/");
        var captured = org.mockito.ArgumentCaptor.forClass(HttpRequest.class);
        verify(lastHttp).send(captured.capture(), any(HttpResponse.BodyHandler.class));
        assertNull(captured.getValue().uri().getQuery());
    }
    @Test void publicSignupCannotRequestPlatformOrClinicAdminRole() {
        assertFalse(OtpLoginService.allowed("clinic", UserRole.PLATFORM_ADMIN));
        assertFalse(OtpLoginService.allowed("patient", UserRole.CLINIC_ADMIN));
        assertFalse(OtpLoginService.allowed("dentist", UserRole.CLINIC_ADMIN));
        assertTrue(OtpLoginService.allowed("platform", UserRole.PLATFORM_ADMIN));
        assertTrue(OtpLoginService.allowed("clinic", UserRole.INCOMPLETE_SIGNUP));
    }

    @Test void otpRedirectsMatchPortalEntryPoints() {
        assertEquals("/professional/signup", OtpLoginService.redirectPath("dentist"));
        assertEquals("/business/signup", OtpLoginService.redirectPath("clinic"));
        assertEquals("/platform/login", OtpLoginService.redirectPath("platform"));
    }
}
