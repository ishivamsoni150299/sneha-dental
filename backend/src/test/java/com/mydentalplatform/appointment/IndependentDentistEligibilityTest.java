package com.mydentalplatform.appointment;

import java.time.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.mydentalplatform.video.DailyVideoClient;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class IndependentDentistEligibilityTest {

    private AppointmentController.BookingRequest request(UUID doctorId, UUID clinicId, String mode, String service) {
        return new AppointmentController.BookingRequest(
            clinicId, "BK", "Jane Doe", "9876543210", "jane@example.com",
            service, LocalDate.now().plusDays(3), LocalTime.of(14, 0), doctorId, null, "marketplace",
            OffsetDateTime.now().plusHours(4), "2026-09-07", Map.of(), mode
        );
    }

    @Test
    void independentDentistRejectsInPersonBookingWith400() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new AppointmentService(jdbc, new ObjectMapper());

        UUID providerId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();

        when(jdbc.queryForObject(contains("legacy_doctor_id IS NULL"), eq(Boolean.class), eq(providerId)))
            .thenReturn(true);

        var request = request(providerId, clinicId, "in_person", "Dental Consultation");

        ResponseStatusException exception = assertThrows(ResponseStatusException.class, () -> service.book(request));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        assertTrue(exception.getReason().contains("Dentists from an independent profile are eligible for video consultations only"));

        verify(jdbc, never()).update(contains("insert into appointments"), any(Object[].class));
    }

    @Test
    void independentDentistAllowsVideoConsultation() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        when(daily.configured()).thenReturn(true);

        UUID providerId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();

        when(jdbc.queryForObject(contains("legacy_doctor_id IS NULL"), eq(Boolean.class), eq(providerId)))
            .thenReturn(true);
        when(jdbc.queryForObject(contains("p.active = true"), eq(Boolean.class), eq(providerId)))
            .thenReturn(true);
        when(jdbc.queryForList(contains("SELECT id, slug, full_name FROM providers"), eq(providerId)))
            .thenReturn(List.of(Map.of("id", providerId, "slug", "dr-independent", "full_name", "Dr. Independent")));
        when(jdbc.queryForList(contains("select d.schedule::text from doctors d"), eq(String.class), any(Object[].class)))
            .thenReturn(List.of());
        when(jdbc.queryForList(contains("select m.schedule::text from provider_location_memberships m"), eq(String.class), any(Object[].class)))
            .thenReturn(List.of());
        when(jdbc.queryForObject(contains("providers where id = ? and active = true"), eq(Boolean.class), eq(providerId)))
            .thenReturn(true);

        var service = new AppointmentService(jdbc, new ObjectMapper(), null, daily);
        var request = request(providerId, clinicId, "video", "Video Consultation");

        assertDoesNotThrow(() -> service.book(request));

        verify(jdbc).update(contains("insert into appointments"), any(Object[].class));
        verify(jdbc).update(contains("insert into appointment_slots"), any(Object[].class));
    }

    @Test
    void clinicDentistAllowsBothInPersonAndVideo() {
        var jdbc = mock(JdbcTemplate.class);
        var daily = mock(DailyVideoClient.class);
        when(daily.configured()).thenReturn(true);

        UUID doctorId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();

        when(jdbc.queryForObject(contains("legacy_doctor_id IS NULL"), eq(Boolean.class), any(Object[].class)))
            .thenReturn(false);
        when(jdbc.queryForObject(contains("owner_provider_id IS NOT NULL"), eq(Boolean.class), any(Object[].class)))
            .thenReturn(false);

        String day = LocalDate.now().plusDays(3).getDayOfWeek().name().substring(0, 3).toLowerCase(java.util.Locale.ROOT);
        String scheduleJson = "{\"" + day + "\":{\"enabled\":true,\"start\":\"09:00\",\"end\":\"18:00\"}}";
        when(jdbc.queryForList(contains("select d.schedule::text from doctors d"), eq(String.class), any(Object[].class)))
            .thenReturn(List.of(scheduleJson));

        when(jdbc.queryForObject(contains("select exists(select 1 from clinics c join doctors d on d.clinic_id = c.id"), eq(Boolean.class), any(Object[].class)))
            .thenReturn(true);

        var service = new AppointmentService(jdbc, new ObjectMapper(), null, daily);

        var inPersonRequest = request(doctorId, clinicId, "in_person", "Consultation");
        assertDoesNotThrow(() -> service.book(inPersonRequest));

        var videoRequest = request(doctorId, clinicId, "video", "Video Consultation");
        assertDoesNotThrow(() -> service.book(videoRequest));
    }
}
