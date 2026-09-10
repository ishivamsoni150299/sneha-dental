package com.mydentalplatform.clinic;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class DoctorScheduleTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final DoctorController controller = new DoctorController(jdbc, new ObjectMapper());
    private final UUID clinic = UUID.randomUUID(), doctor = UUID.randomUUID();
    private final Jwt jwt = Jwt.withTokenValue("test").header("alg", "HS256").claim("clinic_id", clinic.toString()).build();
    private Map<String, Object> schedule() {
        Map<String, Object> schedule = new HashMap<>();
        for (String day : List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun"))
            schedule.put(day, Map.of("enabled", true, "start", "09:00", "end", "17:00"));
        return schedule;
    }
    @Test void cannotEditDoctorFromAnotherClinic() {
        var response = controller.update(jwt, doctor, new DoctorController.DoctorRequest("Doctor", "BDS", "", true, schedule()));
        assertEquals(404, response.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void dayOffAndUnavailableToggleCannotSilentlyInvalidateUpcomingBookings() {
        when(jdbc.queryForList(contains("for update"), eq(UUID.class), eq(doctor), eq(clinic))).thenReturn(List.of(doctor));
        LocalDate date = LocalDate.now().plusDays(3);
        when(jdbc.queryForList(contains("from appointments"), eq(clinic), eq(doctor)))
            .thenReturn(List.of(Map.of("appointment_date", date, "appointment_time", LocalTime.NOON)));
        var dayOff = schedule(); dayOff.put("daysOff", List.of(date.toString()));
        assertThrows(ResponseStatusException.class, () -> controller.update(jwt, doctor,
            new DoctorController.DoctorRequest("Doctor", "BDS", "", true, dayOff)));
        assertThrows(ResponseStatusException.class, () -> controller.update(jwt, doctor,
            new DoctorController.DoctorRequest("Doctor", "BDS", "", false, schedule())));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void invalidHoursAreRejectedBeforeCreatingDoctor() {
        var bad = schedule(); bad.put("mon", Map.of("enabled", true, "start", "17:00", "end", "09:00"));
        assertThrows(ResponseStatusException.class,
            () -> controller.create(jwt, new DoctorController.DoctorRequest("Doctor", "BDS", "", true, bad)));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
