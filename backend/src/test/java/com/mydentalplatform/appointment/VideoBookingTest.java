package com.mydentalplatform.appointment;

import java.time.*;
import java.util.Map;
import java.util.UUID;
import com.mydentalplatform.video.DailyVideoClient;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class VideoBookingTest {
    private AppointmentController.BookingRequest request(String mode, String service) {
        return new AppointmentController.BookingRequest(UUID.randomUUID(), "BK", "Test Patient", "9999999999", null,
            service, LocalDate.now().plusDays(2), LocalTime.NOON, UUID.randomUUID(), null, "marketplace",
            OffsetDateTime.now().plusHours(2), "2026-09-07", Map.of(), mode);
    }

    @Test void rejectsUnsupportedModesAndUnconfiguredVideoWithoutWrites() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new AppointmentService(jdbc, new ObjectMapper());
        assertThrows(ResponseStatusException.class, () -> service.book(request("invalid", "Video Consultation")));
        assertThrows(ResponseStatusException.class, () -> service.book(request("video", "Video Consultation")));
        verifyNoInteractions(jdbc);
    }

    @Test void rejectsInvasiveServicesAndClinicsWithoutVideoOptIn() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        when(daily.configured()).thenReturn(true);
        var service = new AppointmentService(jdbc, new ObjectMapper(), null, daily);
        assertThrows(ResponseStatusException.class, () -> service.book(request("video", "Root Canal Treatment")));
        assertThrows(ResponseStatusException.class, () -> service.book(request("video", "Video Consultation")));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test void storesVideoModeAndUsesTheSameAtomicSlotReservation() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        when(daily.configured()).thenReturn(true);
        when(jdbc.queryForObject(contains("select exists"), eq(Boolean.class), any(Object[].class))).thenReturn(true);
        var service = new AppointmentService(jdbc, new ObjectMapper(), null, daily);
        service.book(request("video", "Video Consultation"));
        verify(jdbc).update(contains("consultation_mode"), any(Object[].class));
        verify(jdbc).update(contains("insert into appointment_slots"), any(Object[].class));
    }
}
