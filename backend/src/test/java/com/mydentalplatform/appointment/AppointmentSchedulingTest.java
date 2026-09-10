package com.mydentalplatform.appointment;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AppointmentSchedulingTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AppointmentService service = new AppointmentService(jdbc, new ObjectMapper());
    private final UUID clinic = UUID.randomUUID(), appointment = UUID.randomUUID(), doctor = UUID.randomUUID();
    private final LocalDate date = LocalDate.now(ScheduleRules.INDIA).plusDays(3);
    private String schedule() {
        String day = date.getDayOfWeek().name().substring(0, 3).toLowerCase(Locale.ROOT);
        return "{\"" + day + "\":{\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\",\"breaks\":[{\"start\":\"13:00\",\"end\":\"14:00\"}]}}";
    }
    private AppointmentController.RescheduleRequest request(LocalTime time) {
        return new AppointmentController.RescheduleRequest(date, time, doctor);
    }
    @BeforeEach void setup() {
        when(jdbc.queryForList(contains("consultation_mode from appointments"), eq(appointment), eq(clinic)))
            .thenReturn(List.of(Map.of("status", "confirmed", "consultation_mode", "in_person")));
        when(jdbc.queryForList(contains("for update of d"), eq(String.class), eq(doctor), eq(clinic)))
            .thenReturn(List.of(schedule()));
    }
    @Test void reschedulesWithinTenantAndPreservesConfirmation() {
        service.reschedule(clinic, appointment, request(LocalTime.of(10, 0)));
        verify(jdbc).update(contains("insert into appointment_slots"), eq(clinic), eq(doctor), eq(appointment), eq(date), eq(LocalTime.of(10, 0)));
        verify(jdbc).update(contains("updated_at = now() where id = ? and clinic_id = ?"), eq(doctor), eq(date), eq(LocalTime.of(10, 0)), eq(appointment), eq(clinic));
    }
    @Test void anotherClinicCannotRescheduleAppointment() {
        var error = assertThrows(ResponseStatusException.class,
            () -> service.reschedule(UUID.randomUUID(), appointment, request(LocalTime.of(10, 0))));
        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void rejectsBreaksOutsideHoursOffGridAndForeignDoctorsBeforeWrites() {
        for (LocalTime time : List.of(LocalTime.of(8, 0), LocalTime.of(13, 0), LocalTime.of(10, 15), LocalTime.of(17, 0)))
            assertThrows(ResponseStatusException.class, () -> service.reschedule(clinic, appointment, request(time)));
        assertThrows(ResponseStatusException.class, () -> service.reschedule(clinic, appointment,
            new AppointmentController.RescheduleRequest(date, LocalTime.NOON, UUID.randomUUID())));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void occupiedSlotReturnsConflictWithoutUpdatingAppointment() {
        when(jdbc.update(contains("insert into appointment_slots"), any(Object[].class))).thenThrow(new DuplicateKeyException("occupied"));
        var error = assertThrows(ResponseStatusException.class,
            () -> service.reschedule(clinic, appointment, request(LocalTime.of(10, 0))));
        assertEquals(409, error.getStatusCode().value());
        verify(jdbc, never()).update(contains("update appointments"), any(Object[].class));
    }
    @Test void terminalAppointmentsCannotBeRescheduled() {
        when(jdbc.queryForList(contains("consultation_mode from appointments"), eq(appointment), eq(clinic)))
            .thenReturn(List.of(Map.of("status", "cancelled", "consultation_mode", "in_person")));
        assertThrows(ResponseStatusException.class, () -> service.reschedule(clinic, appointment, request(LocalTime.NOON)));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void noPreferenceReservesAnActualAvailableDoctor() {
        when(jdbc.queryForList(contains("from doctors where clinic_id"), eq(clinic)))
            .thenReturn(List.of(Map.of("id", doctor, "available", true, "schedule", schedule())));
        when(jdbc.queryForObject(contains("from appointment_slots"), eq(Boolean.class), any(Object[].class))).thenReturn(false);
        service.book(new AppointmentController.BookingRequest(clinic, "BK", "Patient", "9999999999", null,
            "Cleaning", date, LocalTime.NOON, null, null, "clinic_website", null, null, null, "in_person"));
        verify(jdbc).update(contains("insert into appointment_slots"), eq(clinic), eq(doctor), any(UUID.class), eq(date), eq(LocalTime.NOON));
    }

    @Test void patientCannotMoveAnUnassignedAppointmentIntoADoctorBreak() {
        Map<String, Object> current = new HashMap<>();
        current.put("status", "confirmed"); current.put("rawDate", date); current.put("rawTime", LocalTime.NOON);
        current.put("rawClinicId", clinic); current.put("consultationMode", "in_person");
        when(jdbc.query(contains("for update of a"), org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<Map<String, Object>>>any(),
            eq(appointment), eq("9999999999"))).thenReturn(List.of(current));
        when(jdbc.queryForList(contains("from doctors where clinic_id"), eq(clinic)))
            .thenReturn(List.of(Map.of("id", doctor, "available", true, "schedule", schedule())));
        assertThrows(ResponseStatusException.class, () -> service.patientUpdate(appointment,
            new AppointmentController.PatientUpdateRequest("9999999999", null, date, LocalTime.of(13, 0), null)));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
