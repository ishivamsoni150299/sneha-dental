package com.mydentalplatform.clinic;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.mydentalplatform.appointment.ScheduleRules;

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
import org.springframework.transaction.annotation.Transactional;
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
        if (date.isBefore(LocalDate.now(ScheduleRules.INDIA))) return List.of();
        List<Map<String, Object>> schedules = jdbcTemplate.query("""
            select schedule::text as schedule from doctors
            where id = ? and clinic_id = ? and available = true
            """, (resultSet, rowNumber) -> parseJson(resultSet.getString("schedule")), doctorId, clinicId);
        if (schedules.isEmpty()) return List.of();
        List<String> reserved = jdbcTemplate.queryForList("""
            select to_char(appointment_time, 'HH24:MI') from appointment_slots
            where clinic_id = ? and doctor_id = ? and appointment_date = ?
            """, String.class, clinicId, doctorId, date);
        List<String> result = new ArrayList<>();
        for (LocalTime time : ScheduleRules.slots(schedules.getFirst(), date)) {
            if (!date.atTime(time).isAfter(java.time.LocalDateTime.now(ScheduleRules.INDIA))) continue;
            String slot = time.toString();
            if (!reserved.contains(slot)) result.add(slot);
        }
        return result;
    }

    @PostMapping("/clinics/current/doctors")
    @Transactional
    ResponseEntity<Map<String, String>> create(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody DoctorRequest request
    ) {
        UUID id = UUID.randomUUID();
        UUID clinicId = clinicId(jwt);
        ScheduleRules.validate(request.schedule());
        jdbcTemplate.update("""
            insert into doctors (id, clinic_id, name, qualification, speciality, available, schedule)
            values (?, ?, ?, ?, ?, ?, cast(? as jsonb))
            """, id, clinicId, request.name().trim(), request.qualification(), request.speciality(),
            request.available(), json(request.schedule()));
        ensureClinicLocation(clinicId);
        String slug = request.name().trim().toLowerCase(java.util.Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "")
            + "-" + id.toString().substring(0, 8);
        jdbcTemplate.update("""
            insert into providers (id, legacy_doctor_id, slug, full_name, qualification, speciality, active)
            values (?, ?, ?, ?, ?, ?, ?)
            """, id, id, slug, request.name().trim(), request.qualification(), request.speciality(), request.available());
        jdbcTemplate.update("insert into provider_marketplace_listings (provider_id) values (?)", id);
        jdbcTemplate.update("""
            insert into provider_location_memberships (
                provider_id, location_id, status, schedule, accepted_at
            ) values (?, ?, 'active', cast(? as jsonb), now())
            """, id, clinicId, json(request.schedule()));
        return ResponseEntity.ok(Map.of("id", id.toString()));
    }

    @PatchMapping("/clinics/current/doctors/{doctorId}")
    @Transactional
    ResponseEntity<Void> update(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID doctorId,
        @Valid @RequestBody DoctorRequest request
    ) {
        ScheduleRules.validate(request.schedule());
        List<UUID> locked = jdbcTemplate.queryForList(
            "select id from doctors where id = ? and clinic_id = ? for update", UUID.class, doctorId, clinicId(jwt));
        if (locked.isEmpty()) return ResponseEntity.notFound().build();
        List<Map<String, Object>> bookings = jdbcTemplate.queryForList("""
            select appointment_date, appointment_time from appointments
            where clinic_id = ? and doctor_id = ? and status in ('pending', 'confirmed', 'checked_in')
              and appointment_date + appointment_time > (now() at time zone 'Asia/Kolkata')
            """, clinicId(jwt), doctorId);
        for (Map<String, Object> booking : bookings) {
            LocalDate date = LocalDate.parse(booking.get("appointment_date").toString());
            LocalTime time = LocalTime.parse(booking.get("appointment_time").toString());
            if (!request.available() || !ScheduleRules.slots(request.schedule(), date).contains(time))
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "Reschedule or cancel affected upcoming appointments before changing this schedule.");
        }
        int updated = jdbcTemplate.update("""
            update doctors set name = ?, qualification = ?, speciality = ?, available = ?,
                schedule = cast(? as jsonb), updated_at = now()
            where id = ? and clinic_id = ?
            """, request.name().trim(), request.qualification(), request.speciality(), request.available(),
            json(request.schedule()), doctorId, clinicId(jwt));
        if (updated == 1) {
            jdbcTemplate.update("""
                update providers set full_name = ?, qualification = ?, speciality = ?, active = ?, updated_at = now()
                where legacy_doctor_id = ?
                """, request.name().trim(), request.qualification(), request.speciality(), request.available(), doctorId);
            jdbcTemplate.update("""
                update provider_location_memberships set schedule = cast(? as jsonb),
                    status = ?, updated_at = now()
                where provider_id = ? and location_id = ?
                """, json(request.schedule()), request.available() ? "active" : "inactive", doctorId, clinicId(jwt));
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/clinics/current/doctors/{doctorId}")
    @Transactional
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID doctorId) {
        UUID clinicId = clinicId(jwt);
        jdbcTemplate.update("""
            update provider_location_memberships set status = 'inactive', updated_at = now()
            where provider_id = ? and location_id = ?
            """, doctorId, clinicId);
        int deleted = jdbcTemplate.update(
            "delete from doctors where id = ? and clinic_id = ?", doctorId, clinicId);
        if (deleted == 1) {
            jdbcTemplate.update("""
                update providers set active = false, updated_at = now()
                where id = ? and user_id is null
                  and not exists (select 1 from provider_location_memberships m where m.provider_id = providers.id and m.status = 'active')
                """, doctorId);
        }
        return deleted == 1 ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    private void ensureClinicLocation(UUID clinicId) {
        jdbcTemplate.update("""
            insert into practice_locations (
                id, clinic_id, name, address_line1, address_line2, locality, city,
                latitude, longitude, phone_e164, active
            )
            select c.id, c.id, c.name,
                   coalesce(nullif(c.public_config ->> 'addressLine1', ''), 'Address pending'),
                   nullif(c.public_config ->> 'addressLine2', ''),
                   nullif(c.public_config -> 'marketplaceProfile' ->> 'locality', ''),
                   coalesce(nullif(c.public_config ->> 'city', ''), 'City pending'),
                   nullif(c.public_config -> 'marketplaceProfile' ->> 'latitude', '')::numeric,
                   nullif(c.public_config -> 'marketplaceProfile' ->> 'longitude', '')::numeric,
                   nullif(c.public_config ->> 'phoneE164', ''), c.active
            from clinics c where c.id = ?
            on conflict (id) do nothing
            """, clinicId);
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
