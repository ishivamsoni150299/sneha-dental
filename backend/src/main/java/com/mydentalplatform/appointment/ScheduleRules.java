package com.mydentalplatform.appointment;

import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Shared 30-minute appointment rules for booking and public availability. */
public final class ScheduleRules {
    public static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final List<String> DAYS = List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun");
    private ScheduleRules() {}

    public static void validate(Map<String, Object> schedule) {
        try {
            if (schedule == null) throw new IllegalArgumentException();
            for (String key : DAYS) {
                Object value = schedule.get(key);
                if (!(value instanceof Map<?, ?> day) || !(day.get("enabled") instanceof Boolean))
                    throw new IllegalArgumentException();
                if (!Boolean.TRUE.equals(day.get("enabled"))) continue;
                int start = minutes(day.get("start")), end = minutes(day.get("end"));
                if (end - start < 30) throw new IllegalArgumentException();
                Object breaks = day.get("breaks");
                if (breaks != null) {
                    if (!(breaks instanceof List<?> list) || list.size() > 10) throw new IllegalArgumentException();
                    int previousEnd = start;
                    for (Object item : list) {
                        if (!(item instanceof Map<?, ?> pause)) throw new IllegalArgumentException();
                        int from = minutes(pause.get("start")), to = minutes(pause.get("end"));
                        if (from < previousEnd || to <= from || to > end) throw new IllegalArgumentException();
                        previousEnd = to;
                    }
                }
            }
            Object off = schedule.get("daysOff");
            if (off != null) {
                if (!(off instanceof List<?> list) || list.size() > 366) throw new IllegalArgumentException();
                for (Object date : list) LocalDate.parse((String) date);
            }
        } catch (RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Check working hours, ordered non-overlapping breaks, and days off. Each appointment needs 30 minutes.");
        }
    }

    public static List<LocalTime> slots(Map<String, Object> schedule, LocalDate date) {
        try {
            if (schedule.get("daysOff") instanceof List<?> off && off.contains(date.toString())) return List.of();
            Object value = schedule.get(DAYS.get(date.getDayOfWeek().getValue() - 1));
            if (!(value instanceof Map<?, ?> day) || !Boolean.TRUE.equals(day.get("enabled"))) return List.of();
            int start = minutes(day.get("start")), end = minutes(day.get("end"));
            List<LocalTime> result = new ArrayList<>();
            for (int minute = start; minute + 30 <= end; minute += 30) {
                boolean blocked = false;
                if (day.get("breaks") instanceof List<?> breaks) {
                    for (Object item : breaks) {
                        Map<?, ?> pause = (Map<?, ?>) item;
                        if (minute < minutes(pause.get("end")) && minute + 30 > minutes(pause.get("start"))) blocked = true;
                    }
                }
                if (!blocked) result.add(LocalTime.of(minute / 60, minute % 60));
            }
            return result;
        } catch (RuntimeException malformedSchedule) { return List.of(); }
    }

    private static int minutes(Object value) {
        if (!(value instanceof String text) || !text.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))
            throw new IllegalArgumentException();
        LocalTime time = LocalTime.parse(text);
        return time.getHour() * 60 + time.getMinute();
    }
}
