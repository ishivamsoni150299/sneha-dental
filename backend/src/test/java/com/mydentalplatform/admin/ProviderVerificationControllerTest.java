package com.mydentalplatform.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

class ProviderVerificationControllerTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ProviderVerificationController controller = new ProviderVerificationController(jdbc);
    private final UUID id = UUID.randomUUID();
    private final UUID reviewer = UUID.randomUUID();
    private Jwt jwt(String role) {
        return Jwt.withTokenValue("test").header("alg", "RS256").subject(reviewer.toString()).claim("role", role).build();
    }

    @Test void nonAdminsCannotReadOrDecide() {
        for (String role : new String[] {"dentist", "clinic-admin", "patient"}) {
            assertEquals(403, assertThrows(ResponseStatusException.class, () -> controller.pending(jwt(role))).getStatusCode().value());
            assertThrows(ResponseStatusException.class, () -> controller.verify(jwt(role), id));
            assertThrows(ResponseStatusException.class, () -> controller.reject(jwt(role), id, Map.of("reason", "Invalid")));
        }
        verifyNoInteractions(jdbc);
    }

    @Test void staleApprovalDoesNotPublishOrRecordReview() {
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> controller.verify(jwt("platform-admin"), id)).getStatusCode().value());
        verify(jdbc).update(anyString(), eq(id));
        verifyNoMoreInteractions(jdbc);
    }

    @Test void approvalPublishesAndRecordsReviewer() {
        when(jdbc.update(anyString(), eq(id))).thenReturn(1);
        controller.verify(jwt("platform-admin"), id);
        verify(jdbc).update(contains("INSERT INTO provider_marketplace_listings"), eq(id));
        verify(jdbc).update(contains("INSERT INTO provider_verification_reviews"), eq(id), eq(reviewer), eq("verified"), isNull());
    }

    @Test void rejectionRequiresReason() {
        assertThrows(ResponseStatusException.class, () -> controller.reject(jwt("platform-admin"), id, Map.of("reason", "  ")));
        assertThrows(ResponseStatusException.class, () -> controller.reject(jwt("platform-admin"), id, Map.of("reason", "x".repeat(1001))));
        verifyNoInteractions(jdbc);
    }

    @Test void rejectionUnlistsAndRecordsReason() {
        when(jdbc.update(anyString(), eq(id))).thenReturn(1);
        controller.reject(jwt("platform-admin"), id, Map.of("reason", " Incorrect registration "));
        verify(jdbc).update(contains("UPDATE provider_marketplace_listings"), eq(id));
        verify(jdbc).update(contains("INSERT INTO provider_verification_reviews"), eq(id), eq(reviewer), eq("rejected"), eq("Incorrect registration"));
    }
}
