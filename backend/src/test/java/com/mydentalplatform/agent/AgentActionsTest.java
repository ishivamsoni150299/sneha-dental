package com.mydentalplatform.agent;

import com.mydentalplatform.clinic.ClinicOnboardingService;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AgentActionsTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ClinicOnboardingService onboarding = mock(ClinicOnboardingService.class);
    private final ObjectMapper json = new ObjectMapper();
    private final AgentActions actions = new AgentActions(jdbc, json, onboarding);
    private final UUID user = UUID.randomUUID(), family = UUID.randomUUID();
    private Jwt actor(String role) { return Jwt.withTokenValue("test").header("alg", "HS256").subject(user.toString())
        .claim("sid", family.toString()).claim("role", role).claim("email", "owner@example.test").build(); }

    @Test void dentistCannotChangeItsRoleByAskingForClinicCreation() {
        var result = actions.prepare(json.readTree("{}"), actor("dentist"));
        assertEquals("needs_input", result.get("status"));
        verifyNoInteractions(jdbc, onboarding);
    }
    @Test void navigationUsesActorRoleAndRejectsArbitraryUrls() {
        assertEquals("/appointments", actions.navigate("appointments", actor("patient")).get("path"));
        assertEquals("/workspace", actions.navigate("appointments", actor("dentist")).get("path"));
        assertEquals("/account", actions.navigate("settings", actor("patient")).get("path"));
        assertThrows(ResponseStatusException.class, () -> actions.navigate("https://evil.example", actor("patient")));
    }
    @Test void confirmationRequiresTheDraftOwnerAndSessionFamily() {
        UUID draft = UUID.randomUUID();
        when(jdbc.queryForList(anyString(), eq(draft), eq(user), eq(family))).thenReturn(List.of());
        var error = assertThrows(ResponseStatusException.class, () -> actions.confirm(draft, actor("incomplete-signup")));
        assertEquals(404, error.getStatusCode().value());
        verify(jdbc).queryForList(contains("user_id = ? and session_family = ?"), eq(draft), eq(user), eq(family));
        verifyNoInteractions(onboarding);
    }
    @Test void completedConfirmationReturnsSavedResultWithoutCreatingAnotherClinic() {
        UUID draft = UUID.randomUUID();
        when(jdbc.queryForList(anyString(), eq(draft), eq(user), eq(family))).thenReturn(List.of(Map.of(
            "status", "completed", "payload", "{}", "result", "{\"status\":\"succeeded\",\"clinicId\":\"saved\"}")));
        assertEquals("saved", actions.confirm(draft, actor("clinic-admin")).get("clinicId"));
        verifyNoInteractions(onboarding);
    }
    @Test void cancellationAndChangedRolesCannotCommitPendingDrafts() {
        UUID draft = UUID.randomUUID();
        when(jdbc.queryForList(anyString(), eq(draft), eq(user), eq(family))).thenReturn(List.of(Map.of("status", "cancelled", "payload", "{}")));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> actions.confirm(draft, actor("incomplete-signup"))).getStatusCode().value());
        when(jdbc.queryForList(anyString(), eq(draft), eq(user), eq(family))).thenReturn(List.of(Map.of("status", "pending", "payload", "{}")));
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> actions.confirm(draft, actor("dentist"))).getStatusCode().value());
        verifyNoInteractions(onboarding);
    }
    @Test void validConfirmationCallsTheExistingDomainServiceAndStoresItsResult() {
        UUID draft = UUID.randomUUID();
        when(jdbc.queryForList(anyString(), eq(draft), eq(user), eq(family))).thenReturn(List.of(Map.of("status", "pending", "payload", "{\"name\":\"My clinic\"}")));
        when(onboarding.create(eq(user), eq("owner@example.test"), anyMap())).thenReturn(Map.of("clinicId", "clinic-1"));
        assertEquals("clinic-1", actions.confirm(draft, actor("incomplete-signup")).get("clinicId"));
        verify(onboarding, times(1)).create(eq(user), eq("owner@example.test"), anyMap());
        verify(jdbc).update(contains("status = 'completed'"), anyString(), eq(draft));
    }
    @Test void exhaustedQuotaDoesNotCallTheProviderOrChangeAClinic() {
        when(jdbc.queryForList(anyString(), eq(user), eq("turn"), anyLong(), eq(60))).thenReturn(List.of());
        assertEquals(429, assertThrows(ResponseStatusException.class, () -> actions.use(actor("patient"), "turn", 60)).getStatusCode().value());
        verifyNoInteractions(onboarding);
    }
}
