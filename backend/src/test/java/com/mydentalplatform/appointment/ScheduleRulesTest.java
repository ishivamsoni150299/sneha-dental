package com.mydentalplatform.appointment;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class ScheduleRulesTest {
    private Map<String, Object> schedule() {
        Map<String, Object> result = new HashMap<>();
        for (String day : List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun"))
            result.put(day, new HashMap<>(Map.of("enabled", true, "start", "09:00", "end", "17:00")));
        return result;
    }
    @Test void breaksRemoveEveryOverlappingSlotAndDayOffClosesWholeDate() {
        var schedule = schedule();
        schedule.put("mon", Map.of("enabled", true, "start", "09:00", "end", "12:15",
            "breaks", List.of(Map.of("start", "10:15", "end", "10:45"))));
        ScheduleRules.validate(schedule);
        assertEquals(List.of(LocalTime.of(9, 0), LocalTime.of(9, 30), LocalTime.of(11, 0), LocalTime.of(11, 30)),
            ScheduleRules.slots(schedule, LocalDate.of(2026, 9, 14)));
        schedule.put("daysOff", List.of("2026-09-14"));
        assertTrue(ScheduleRules.slots(schedule, LocalDate.of(2026, 9, 14)).isEmpty());
    }
    @Test void midnightEndNeverWrapsIntoAnInfiniteSlotLoop() {
        var schedule = schedule();
        schedule.put("mon", Map.of("enabled", true, "start", "23:00", "end", "23:59"));
        assertEquals(List.of(LocalTime.of(23, 0)), ScheduleRules.slots(schedule, LocalDate.of(2026, 9, 14)));
    }
    @Test void rejectsReversedHoursOverlappingBreaksAndInvalidDates() {
        var schedule = schedule();
        schedule.put("mon", Map.of("enabled", true, "start", "17:00", "end", "09:00"));
        assertThrows(ResponseStatusException.class, () -> ScheduleRules.validate(schedule));
        schedule.put("mon", Map.of("enabled", true, "start", "09:00", "end", "17:00", "breaks",
            List.of(Map.of("start", "10:00", "end", "11:00"), Map.of("start", "10:30", "end", "12:00"))));
        assertThrows(ResponseStatusException.class, () -> ScheduleRules.validate(schedule));
        var invalidDate = schedule(); invalidDate.put("daysOff", List.of("2026-02-30"));
        assertThrows(ResponseStatusException.class, () -> ScheduleRules.validate(invalidDate));
    }
    @Test void malformedLegacyScheduleFailsClosed() {
        assertTrue(ScheduleRules.slots(Map.of("mon", Map.of("enabled", true, "start", "bad")), LocalDate.of(2026, 9, 14)).isEmpty());
    }
    @Test void onlyValidStatusTransitionsAreAllowed() {
        assertTrue(AppointmentTransitions.allows("pending", "confirmed"));
        assertTrue(AppointmentTransitions.allows("confirmed", "checked_in"));
        assertTrue(AppointmentTransitions.allows("checked_in", "completed"));
        assertTrue(AppointmentTransitions.allows("confirmed", "no_show"));
        assertFalse(AppointmentTransitions.allows("checked_in", "no_show"));
        for (String terminal : List.of("cancelled", "declined", "expired", "completed", "no_show"))
            assertFalse(AppointmentTransitions.allows(terminal, "checked_in"));
    }
}
