package com.mydentalplatform.clinic;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api")
public class DoctorController {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public DoctorController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/public/clinics/{clinicId}/doctors")
    List<Map<String, Object>> list(@PathVariable UUID clinicId) {
        return jdbcTemplate.query("""
            select id, name, qualification, speciality, available, schedule::text as schedule, created_at
            from doctors where clinic_id = ? order by name
            """, (resultSet, rowNumber) -> {
                Map<String, Object> doctor = new LinkedHashMap<>();
                doctor.put("id", resultSet.getObject("id", UUID.class).toString());
                doctor.put("name", resultSet.getString("name"));
                doctor.put("qualification", resultSet.getString("qualification"));
                doctor.put("speciality", resultSet.getString("speciality"));
                doctor.put("available", resultSet.getBoolean("available"));
                doctor.put("schedule", parseJson(resultSet.getString("schedule")));
                doctor.put("createdAt", resultSet.getObject("created_at", java.time.OffsetDateTime.class).toInstant().toString());
                return doctor;
            }, clinicId);
    }

    @GetMapping("/public/clinics/{clinicId}/doctors/{doctorId}/slots")
    List<String> slots(
        @PathVariable UUID clinicId,
        @PathVariable UUID doctorId,
        @RequestParam LocalDate date
    ) {
        if (date.isBefore(LocalDate.now())) return List.of();
        List<Map<String, Object>> schedules = jdbcTemplate.query("""
            select schedule::text as schedule from doctors
            where id = ? and clinic_id = ? and available = true
            """, (resultSet, rowNumber) -> parseJson(resultSet.getString("schedule")), doctorId, clinicId);
        if (schedules.isEmpty()) return List.of();
        String day = dayKey(date.getDayOfWeek());
        Object value = schedules.getFirst().get(day);
        if (!(value instanceof Map<?, ?> rawDay) || !Boolean.TRUE.equals(rawDay.get("enabled"))) return List.of();
        LocalTime start = LocalTime.parse(String.valueOf(rawDay.get("start")));
        LocalTime end = LocalTime.parse(String.valueOf(rawDay.get("end")));
        List<String> reserved = jdbcTemplate.queryForList("""
            select to_char(appointment_time, 'HH24:MI') from appointment_slots
            where clinic_id = ? and doctor_id = ? and appointment_date = ?
            """, String.class, clinicId, doctorId, date);
        List<String> result = new ArrayList<>();
        for (LocalTime time = start; time.isBefore(end); time = time.plusMinutes(30)) {
            if (date.equals(LocalDate.now()) && time.isBefore(LocalTime.now())) continue;
            String slot = time.toString();
            if (!reserved.contains(slot)) result.add(slot);
        }
        return result;
    }

    @PostMapping("/clinics/current/doctors")
    ResponseEntity<Map<String, String>> create(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody DoctorRequest request
    ) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
            insert into doctors (id, clinic_id, name, qualification, speciality, available, schedule)
            values (?, ?, ?, ?, ?, ?, cast(? as jsonb))
            """, id, clinicId(jwt), request.name().trim(), request.qualification(), request.speciality(),
            request.available(), json(request.schedule()));
        return ResponseEntity.ok(Map.of("id", id.toString()));
    }

    @PatchMapping("/clinics/current/doctors/{doctorId}")
    ResponseEntity<Void> update(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID doctorId,
        @Valid @RequestBody DoctorRequest request
    ) {
        int updated = jdbcTemplate.update("""
            update doctors set name = ?, qualification = ?, speciality = ?, available = ?,
                schedule = cast(? as jsonb), updated_at = now()
            where id = ? and clinic_id = ?
            """, request.name().trim(), request.qualification(), request.speciality(), request.available(),
            json(request.schedule()), doctorId, clinicId(jwt));
        return updated == 1 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/clinics/current/doctors/{doctorId}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID doctorId) {
        int deleted = jdbcTemplate.update(
            "delete from doctors where id = ? and clinic_id = ?", doctorId, clinicId(jwt));
        return deleted == 1 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    private UUID clinicId(Jwt jwt) {
        return UUID.fromString(jwt.getClaimAsString("clinic_id"));
    }

    private String dayKey(DayOfWeek day) {
        return day.name().substring(0, 3).toLowerCase();
    }

    private Map<String, Object> parseJson(String value) {
        try {
            return objectMapper.readValue(value, new TypeReference<>() {});
        } catch (JacksonException error) {
            throw new IllegalStateException("Doctor schedule contains invalid JSON.", error);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Doctor schedule is invalid.", error);
        }
    }

    record DoctorRequest(
        @NotBlank @Size(max = 160) String name,
        @Size(max = 160) String qualification,
        @Size(max = 160) String speciality,
        boolean available,
        @NotNull Map<String, Object> schedule
    ) {
    }
}