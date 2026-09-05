package com.mydentalplatform.appointment;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AppointmentPrivacyTest {
    @Test
    void clinicalDetailsReachClinicStaffButNotPublicLookup() throws Exception {
        UUID clinicId = UUID.randomUUID();
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet row = mock(ResultSet.class);
        when(row.next()).thenReturn(true);
        when(row.getObject("id", UUID.class)).thenReturn(UUID.randomUUID());
        when(row.getObject("clinic_id", UUID.class)).thenReturn(clinicId);
        when(row.getObject("appointment_date", LocalDate.class)).thenReturn(LocalDate.of(2026, 12, 1));
        when(row.getObject("appointment_time", LocalTime.class)).thenReturn(LocalTime.NOON);
        when(row.getString("clinic_notes")).thenReturn("Private clinical notes");
        when(row.getString("treatment_done")).thenReturn("Cleaning");
        when(row.getBigDecimal("amount_charged")).thenReturn(new BigDecimal("900.00"));
        when(row.getString("payment_status")).thenReturn("paid");
        when(row.getString("payment_method")).thenReturn("upi");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(clinicId)))
            .thenAnswer(call -> List.of(((RowMapper<?>) call.getArgument(1)).mapRow(row, 0)));
        when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(clinicId), eq("BK-ABC"), eq("9999999999")))
            .thenAnswer(call -> ((ResultSetExtractor<?>) call.getArgument(1)).extractData(row));

        var service = new AppointmentService(jdbc, new ObjectMapper());
        var staff = service.list(clinicId).getFirst();
        assertEquals("Private clinical notes", staff.get("clinicNotes"));
        assertEquals(new BigDecimal("900.00"), staff.get("amountCharged"));
        assertEquals("paid", staff.get("paymentStatus"));
        assertFalse(staff.containsKey("rawClinicId"));
        var patient = service.lookup(clinicId, "BK-ABC", "9999999999");
        for (var key : List.of("clinicNotes", "treatmentDone", "amountCharged", "paymentStatus", "paymentMethod", "rawClinicId")) {
            assertFalse(patient.containsKey(key), key + " must not be exposed publicly");
        }
    }
}
