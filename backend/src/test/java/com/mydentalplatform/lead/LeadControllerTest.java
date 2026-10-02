package com.mydentalplatform.lead;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.UUID;

import com.mydentalplatform.auth.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

class LeadControllerTest {
    @Test
    void ordinaryEditsCannotClearAnAuditedOptOut() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var mapper = new ObjectMapper();
        var controller = new LeadController(jdbc, mapper);
        UUID lead = UUID.randomUUID();
        controller.update(session(UserRole.PLATFORM_ADMIN, UUID.randomUUID()), lead,
            Map.of("notes", "Updated note", "doNotCall", false, "callConsent", "granted"));
        var data = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(anyString(), eq(""), eq(""), eq(false), org.mockito.ArgumentMatchers.isNull(), eq(""), eq(""), data.capture(), eq(lead));
        var stored = mapper.readValue(data.getValue(), Map.class);
        assertEquals("Updated note", stored.get("notes"));
        assertEquals(false, stored.containsKey("doNotCall"));
        assertEquals(false, stored.containsKey("callConsent"));
    }

    private Jwt session(UserRole role, UUID actor) {
        return Jwt.withTokenValue("test-session").header("alg", "HS256")
            .subject(actor.toString()).claim("role", role.claimValue()).build();
    }

    @Test
    void rejectsShortPhoneBeforeCreatingLead() {
        var jdbc = mock(JdbcTemplate.class);
        var controller = new LeadController(jdbc, new ObjectMapper());
        assertThrows(ResponseStatusException.class, () -> controller.create(
            session(UserRole.PLATFORM_ADMIN, UUID.randomUUID()),
            Map.of("clinicName", "QA", "phone", "12345", "city", "Noida", "status", "new", "source", "other")));
        verifyNoInteractions(jdbc);
    }

    @Test
    void recordsOptOutAndItsActorWithoutCallingAProvider() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var mapper = new ObjectMapper();
        var controller = new LeadController(jdbc, mapper);
        UUID lead = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        when(jdbc.update(anyString(), anyString(), eq(lead))).thenReturn(1);
        var result = controller.doNotCall(session(UserRole.PLATFORM_ADMIN, actor), lead, Map.of("reason", "Explicit opt-out evidence"));
        assertEquals("opted_out", result.get("status"));
        assertEquals(false, result.get("providerCallCancelled"));
        var changes = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(anyString(), changes.capture(), eq(lead));
        var stored = mapper.readValue(changes.getValue(), Map.class);
        assertEquals(true, stored.get("doNotCall"));
        assertEquals("revoked", stored.get("callConsent"));
        verify(jdbc).update(anyString(), eq(lead), eq(actor), eq("note"), anyString());
    }

    @Test
    void requiresReviewEvidenceBeforeSavingOptOut() {
        var jdbc = mock(JdbcTemplate.class);
        var controller = new LeadController(jdbc, new ObjectMapper());
        assertThrows(ResponseStatusException.class, () -> controller.doNotCall(
            session(UserRole.PLATFORM_ADMIN, UUID.randomUUID()), UUID.randomUUID(), Map.of("reason", "")));
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsClinicOwnerOptOutWithoutReadingOrWritingLeads() {
        var jdbc = mock(JdbcTemplate.class);
        var controller = new LeadController(jdbc, new ObjectMapper());
        assertThrows(ResponseStatusException.class, () -> controller.doNotCall(
            session(UserRole.CLINIC_ADMIN, UUID.randomUUID()), UUID.randomUUID(), Map.of("reason", "Opt-out evidence")));
        verifyNoInteractions(jdbc);
    }
}