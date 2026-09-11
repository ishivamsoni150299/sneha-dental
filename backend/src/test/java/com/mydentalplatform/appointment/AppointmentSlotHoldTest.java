package com.mydentalplatform.appointment;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AppointmentSlotHoldTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AppointmentService service = new AppointmentService(jdbc, new ObjectMapper());
    private final UUID clinic = UUID.randomUUID(), doctor = UUID.randomUUID();
    private final LocalDate date = LocalDate.now(ScheduleRules.INDIA).plusDays(2);
    private final LocalTime time = LocalTime.of(10, 0);

    private String schedule() {
        String day = date.getDayOfWeek().name().substring(0, 3).toLowerCase(Locale.ROOT);
        return "{\"" + day + "\":{\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\",\"breaks\":[]}}";
    }

    @BeforeEach
    void setup() {
        when(jdbc.queryForList(contains("for update of d"), eq(String.class), eq(doctor), eq(clinic)))
            .thenReturn(List.of(schedule()));
    }

    @Test
    void holdsAvailableSlotAndReturnsToken() {
        when(jdbc.queryForList(contains("from appointment_slot_holds"), eq(clinic), eq(doctor), eq(doctor), eq(date), eq(time)))
            .thenReturn(List.of());

        var response = service.holdSlot(new AppointmentController.HoldSlotRequest(clinic, doctor, date, time));

        assertNotNull(response.holdToken());
        assertNotNull(response.expiresAt());
        verify(jdbc).update(contains("delete from appointment_slot_holds where expires_at < now()"));
        verify(jdbc).update(contains("insert into appointment_slot_holds"), eq(clinic), eq(doctor), eq(date), eq(time), eq(response.holdToken()), any());
    }

    @Test
    void rejectsActiveHoldOnSameSlot() {
        when(jdbc.queryForList(contains("from appointment_slot_holds"), eq(clinic), eq(doctor), eq(doctor), eq(date), eq(time)))
            .thenReturn(List.of(Map.of("id", UUID.randomUUID())));

        var error = assertThrows(ResponseStatusException.class,
            () -> service.holdSlot(new AppointmentController.HoldSlotRequest(clinic, doctor, date, time)));

        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void duplicateKeyExceptionReturnsConflict() {
        when(jdbc.queryForList(contains("from appointment_slot_holds"), eq(clinic), eq(doctor), eq(doctor), eq(date), eq(time)))
            .thenReturn(List.of());
        when(jdbc.update(contains("insert into appointment_slot_holds"), any(), any(), any(), any(), any(), any()))
            .thenThrow(new DuplicateKeyException("held"));

        var error = assertThrows(ResponseStatusException.class,
            () -> service.holdSlot(new AppointmentController.HoldSlotRequest(clinic, doctor, date, time)));

        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void releasesHoldToken() {
        service.releaseHold("hold-token-123");
        verify(jdbc).update(contains("delete from appointment_slot_holds where hold_token = ?"), eq("hold-token-123"));
    }
}
