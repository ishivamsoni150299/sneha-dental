package com.mydentalplatform.provider;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.*;
import com.mydentalplatform.appointment.AppointmentService;
import com.mydentalplatform.appointment.AppointmentController;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

class ProviderWorkspaceControllerTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final AppointmentService appointments = mock(AppointmentService.class);
    final ProviderWorkspaceController controller = new ProviderWorkspaceController(jdbc, new ObjectMapper(), appointments);
    final UUID user = UUID.randomUUID(), id = UUID.randomUUID();
    Jwt jwt(String role) { return Jwt.withTokenValue("test").header("alg", "HS256").subject(user.toString()).claim("role", role).build(); }
    Map<String, Object> schedule() {
        Map<String, Object> value = new HashMap<>();
        for (String day : List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun"))
            value.put(day, Map.of("enabled", true, "start", "09:00", "end", "17:00"));
        return value;
    }
    @Test void blocksNonDentistsBeforeDatabaseAccess() {
        assertThrows(ResponseStatusException.class, () -> controller.inbox(jwt("clinic-admin"), "upcoming"));
        assertThrows(ResponseStatusException.class, () -> controller.schedule(jwt("patient"), id, new ProviderWorkspaceController.ScheduleRequest(schedule())));
        verifyNoInteractions(jdbc, appointments);
    }
    @Test void cannotChangeAnotherDentistsAppointment() {
        var error = assertThrows(ResponseStatusException.class, () -> controller.status(jwt("dentist"), id, new AppointmentController.StatusRequest("confirmed", null)));
        assertEquals(404, error.getStatusCode().value());
        verifyNoInteractions(appointments);
        verify(jdbc).queryForList(contains("p.user_id = ?"), eq(UUID.class), eq(id), eq(user));
    }
    @Test void authorizedDecisionUsesExistingStatusWorkflow() {
        UUID clinic = UUID.randomUUID();
        when(jdbc.queryForList(anyString(), eq(UUID.class), eq(id), eq(user))).thenReturn(List.of(clinic));
        var request = new AppointmentController.StatusRequest("confirmed", null);
        controller.status(jwt("dentist"), id, request);
        verify(appointments).setStatus(clinic, id, request);
    }
    @Test void rejectsBlankDeclineReason() {
        assertThrows(ResponseStatusException.class, () -> controller.status(jwt("dentist"), id, new AppointmentController.StatusRequest("declined", " ")));
        verifyNoInteractions(jdbc, appointments);
    }
    @Test void cannotEditAnotherLocation() {
        var error = assertThrows(ResponseStatusException.class, () -> controller.schedule(jwt("dentist"), id, new ProviderWorkspaceController.ScheduleRequest(schedule())));
        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void rejectsScheduleThatRemovesExistingBooking() {
        UUID provider = UUID.randomUUID(), doctor = UUID.randomUUID(), clinic = UUID.randomUUID();
        when(jdbc.queryForList(contains("FOR UPDATE OF m"), eq(user), eq(id)))
            .thenReturn(List.of(Map.of("provider_id", provider, "legacy_doctor_id", doctor, "clinic_id", clinic)));
        when(jdbc.queryForList(contains("SELECT appointment_date"), eq(provider), eq(doctor), eq(id), eq(clinic)))
            .thenReturn(List.of(Map.of("appointment_date", "2026-12-14", "appointment_time", "18:00")));
        var error = assertThrows(ResponseStatusException.class, () -> controller.schedule(jwt("dentist"), id, new ProviderWorkspaceController.ScheduleRequest(schedule())));
        assertEquals(409, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
