package com.mydentalplatform.clinic;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class PatientServiceTest {
    private JdbcTemplate jdbcTemplate;
    private PatientService patientService;
    private final UUID clinicId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        patientService = new PatientService(jdbcTemplate);
    }

    @Test
    void getPatientsPassesNormalizedSearchParamsAndClampsPaging() {
        when(jdbcTemplate.query(
            anyString(),
            any(RowMapper.class),
            eq(clinicId),
            eq("%john%"),
            eq("%john%"),
            eq("%john%"),
            eq(200),
            eq(0)
        )).thenReturn(List.of(
            new PatientService.PatientSummary(
                "+919876543210",
                "John Doe",
                "john@example.com",
                2,
                3,
                "2026-08-15",
                "2026-09-10",
                "2026-01-01",
                new BigDecimal("1500.00"),
                new BigDecimal("1000.00"),
                new BigDecimal("500.00")
            )
        ));

        // Requesting 999 limit and -5 offset tests clamping: limit -> 200, offset -> 0
        List<PatientService.PatientSummary> results = patientService.getPatients(clinicId, "John", 999, -5);

        assertNotNull(results);
        assertEquals(1, results.size());
        PatientService.PatientSummary patient = results.get(0);
        assertEquals("+919876543210", patient.phone());
        assertEquals("John Doe", patient.name());
        assertEquals(2, patient.totalVisits());
        assertEquals(new BigDecimal("500.00"), patient.pendingBalance());
    }

    @Test
    void getPatientsHandlesNullSearch() {
        when(jdbcTemplate.query(
            anyString(),
            any(RowMapper.class),
            eq(clinicId),
            isNull(),
            isNull(),
            isNull(),
            eq(50),
            eq(10)
        )).thenReturn(List.of());

        List<PatientService.PatientSummary> results = patientService.getPatients(clinicId, null, 50, 10);
        assertNotNull(results);
        assertEquals(0, results.size());
    }

    @Test
    void getPatientAppointmentsNormalizesPhoneNumberToLast10Digits() {
        when(jdbcTemplate.query(
            anyString(),
            any(RowMapper.class),
            eq(clinicId),
            eq("9876543210")
        )).thenReturn(List.of(Map.of("id", UUID.randomUUID().toString(), "bookingRef", "SND-1001")));

        List<Map<String, Object>> appointments = patientService.getPatientAppointments(clinicId, "+91 (987) 654-3210");

        assertNotNull(appointments);
        assertEquals(1, appointments.size());
        assertEquals("SND-1001", appointments.get(0).get("bookingRef"));
        verify(jdbcTemplate).query(anyString(), any(RowMapper.class), eq(clinicId), eq("9876543210"));
    }
}
