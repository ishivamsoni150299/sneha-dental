package com.mydentalplatform.video;

import java.time.*;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class VideoConsultationServiceTest {
    private final Instant start = Instant.parse("2026-12-01T04:30:00Z");
    private VideoConsultationService.Visit visit(String mode, String status) {
        return new VideoConsultationService.Visit(mode, status, LocalDate.of(2026,12,1), LocalTime.of(10,0));
    }

    @Test void joinsOnlyInTheScheduledIndiaTimeWindow() {
        var visit = visit("video", "confirmed");
        assertThrows(ResponseStatusException.class, () -> VideoConsultationService.validateAccess(visit, start.minusSeconds(601)));
        assertDoesNotThrow(() -> VideoConsultationService.validateAccess(visit, start.minusSeconds(600)));
        assertDoesNotThrow(() -> VideoConsultationService.validateAccess(visit, start.plusSeconds(3599)));
        assertEquals(410, assertThrows(ResponseStatusException.class,
            () -> VideoConsultationService.validateAccess(visit, start.plusSeconds(3600))).getStatusCode().value());
    }

    @Test void blocksUnconfirmedCancelledAndInPersonVisits() {
        for (String status : List.of("pending", "cancelled", "completed", "declined", "expired", "no_show")) {
            assertThrows(ResponseStatusException.class, () -> VideoConsultationService.validateAccess(visit("video", status), start));
        }
        assertThrows(ResponseStatusException.class, () -> VideoConsultationService.validateAccess(visit("in_person", "confirmed"), start));
        assertDoesNotThrow(() -> VideoConsultationService.validateAccess(visit("video", "checked_in"), start));
    }

    @Test void doesNotIssueProviderTokensForUnknownOrWrongTenantAppointment() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        var service = new VideoConsultationService(jdbc, daily);
        UUID appointment = UUID.randomUUID(), clinic = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        assertEquals(404, assertThrows(ResponseStatusException.class,
            () -> service.join(appointment, clinic, null, null)).getStatusCode().value());
        verify(jdbc).query(contains("a.clinic_id = ?"), any(RowMapper.class), eq(appointment), eq(clinic));
        verifyNoInteractions(daily);
    }

    @Test void patientMustSupplyBothReferenceAndPhone() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        var service = new VideoConsultationService(jdbc, daily);
        assertThrows(ResponseStatusException.class, () -> service.join(UUID.randomUUID(), null, "", "9999999999"));
        assertThrows(ResponseStatusException.class, () -> service.join(UUID.randomUUID(), null, "BK-ABCDEFGH", ""));
        verifyNoInteractions(jdbc, daily);
    }

    @Test void clinicCannotEnableVideoWithoutProviderSetup() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        var service = new VideoConsultationService(jdbc, daily);
        assertThrows(ResponseStatusException.class, () -> service.saveSettings(UUID.randomUUID(), true, 500));
        verifyNoInteractions(jdbc);
    }
}
