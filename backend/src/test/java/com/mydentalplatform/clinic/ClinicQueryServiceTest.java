package com.mydentalplatform.clinic;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.ObjectMapper;

class ClinicQueryServiceTest {
    @Test
    void rejectsInvalidSocialUrlsBeforeWritingSettings() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var service = new ClinicQueryService(jdbc, new ObjectMapper());
        for (String link : List.of("not-a-url", "javascript:alert(1)", "https://user:password@example.test")) {
            assertThrows(IllegalArgumentException.class, () -> service.updateSettings(
                UUID.randomUUID(), Map.of("social", Map.of("instagram", link))));
        }
        verifyNoInteractions(jdbc);
    }

    @Test
    void allowsClearedAndValidSocialLinks() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID clinicId = UUID.randomUUID();
        when(jdbc.update(anyString(), eq(""), anyString(), eq(clinicId))).thenReturn(1);
        var service = new ClinicQueryService(jdbc, new ObjectMapper());
        service.updateSettings(clinicId, Map.of("social", Map.of("instagram", "", "facebook", "https://example.test/clinic")));
        verify(jdbc).update(anyString(), eq(""), anyString(), eq(clinicId));
    }

    @Test
    void privateLookupKeepsTenantScopeWithoutRequiringPublicDeployment() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID clinicId = UUID.randomUUID();
        Map<String, Object> clinic = Map.of("clinicId", clinicId.toString(), "active", false);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(clinicId)))
            .thenReturn(List.of(clinic));

        var service = new ClinicQueryService(jdbc, new ObjectMapper());
        assertEquals(clinic, service.findCurrent(clinicId).orElseThrow());

        var sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), eq(clinicId));
        assertTrue(sql.getValue().contains("where id = ? limit 1"));
        assertFalse(sql.getValue().contains("active = true"));
    }

    @Test
    void publicHostLookupStillRequiresActiveDeployment() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        String host = "inactive.example.test";
        when(jdbc.query(anyString(), any(RowMapper.class), eq(host), eq(host), eq(host)))
            .thenReturn(List.of());

        var service = new ClinicQueryService(jdbc, new ObjectMapper());
        assertTrue(service.resolveByHost(host).isEmpty());

        var sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), eq(host), eq(host), eq(host));
        assertTrue(sql.getValue().contains("where active = true"));
    }
}