package com.mydentalplatform.marketplace;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.mydentalplatform.clinic.ClinicQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class IndependentVideoAvailabilityTest {
    @Test void emptyScheduleDoesNotInventBookableHours() {
        var jdbc = mock(JdbcTemplate.class);
        var clinics = mock(ClinicQueryService.class);
        when(jdbc.queryForList(contains("p.legacy_doctor_id IS NULL"), eq("sneha")))
            .thenReturn(List.of(Map.of("id", UUID.randomUUID(), "full_name", "Sneha", "schedule", "{}")));
        var response = new MarketplaceApiService(clinics, jdbc, new ObjectMapper()).availability("sneha", LocalDate.now().plusDays(1), 7);
        assertEquals(7, response.days().size());
        assertTrue(response.days().stream().allMatch(day -> day.slots().isEmpty()));
        verifyNoInteractions(clinics);
    }
}
