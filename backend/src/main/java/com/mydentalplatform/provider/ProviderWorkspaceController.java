package com.mydentalplatform.provider;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.mydentalplatform.appointment.AppointmentController;
import com.mydentalplatform.appointment.AppointmentService;
import com.mydentalplatform.appointment.ScheduleRules;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/providers/me")
public class ProviderWorkspaceController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final AppointmentService appointments;

    public ProviderWorkspaceController(JdbcTemplate jdbc, ObjectMapper mapper, AppointmentService appointments) {
        this.jdbc = jdbc; this.mapper = mapper; this.appointments = appointments;
    }

    private UUID userId(Jwt jwt) {
        if (jwt == null || !"dentist".equals(jwt.getClaimAsString("role")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dentist access is required.");
        return UUID.fromString(jwt.getSubject());
    }

    @GetMapping("/appointments")
    public List<Map<String, Object>> inbox(@AuthenticationPrincipal Jwt jwt,
        @RequestParam(defaultValue = "upcoming") String view) {
        UUID user = userId(jwt);
        if (!List.of("pending", "upcoming", "history").contains(view))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown appointment view.");
        String filter = switch (view) {
            case "pending" -> " AND a.status = 'pending'";
            case "history" -> " AND (a.appointment_date < (now() AT TIME ZONE 'Asia/Kolkata')::date OR a.status IN ('completed','cancelled','declined','no_show','expired'))";
            default -> " AND a.appointment_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date AND a.status IN ('pending','confirmed','checked_in')";
        };
        return jdbc.queryForList("""
            SELECT a.id, a.booking_ref, a.patient_name, a.phone_e164, a.service,
                a.appointment_date::text AS date, to_char(a.appointment_time, 'HH24:MI') AS time,
                a.status::text AS status, a.source, c.name AS location_name, a.cancellation_reason
            FROM appointments a JOIN clinics c ON c.id = a.clinic_id
            JOIN providers p ON (a.provider_id = p.id OR (a.provider_id IS NULL AND a.doctor_id = p.legacy_doctor_id))
            WHERE p.user_id = ? AND p.active
            """ + filter + (view.equals("history") ? " ORDER BY a.appointment_date DESC, a.appointment_time DESC" : " ORDER BY a.appointment_date, a.appointment_time")
            + " LIMIT 200", user);
    }

    @PatchMapping("/appointments/{id}/status")
    @Transactional
    public Map<String, Boolean> status(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
        @Valid @RequestBody AppointmentController.StatusRequest request) {
        UUID user = userId(jwt);
        if (!List.of("confirmed", "declined", "cancelled", "checked_in", "completed", "no_show").contains(request.status()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid appointment status.");
        if (List.of("declined", "cancelled").contains(request.status()) &&
            (request.cancellationReason() == null || request.cancellationReason().isBlank()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reason is required.");
        List<UUID> clinics = jdbc.queryForList("""
            SELECT a.clinic_id FROM appointments a
            JOIN providers p ON (a.provider_id = p.id OR (a.provider_id IS NULL AND a.doctor_id = p.legacy_doctor_id))
            WHERE a.id = ? AND p.user_id = ? AND p.active FOR UPDATE OF a
            """, UUID.class, id, user);
        if (clinics.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found.");
        appointments.setStatus(clinics.getFirst(), id, request);
        return Map.of("ok", true);
    }

    @PatchMapping("/locations/{id}/schedule")
    @Transactional
    public Map<String, Boolean> schedule(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
        @Valid @RequestBody ScheduleRequest request) {
        UUID user = userId(jwt);
        ScheduleRules.validate(request.schedule());
        // Match the booking engine's doctor lock before changing its availability.
        jdbc.queryForList("""
            SELECT d.id FROM doctors d JOIN providers p ON p.legacy_doctor_id = d.id
            JOIN practice_locations l ON l.clinic_id = d.clinic_id
            WHERE p.user_id = ? AND l.id = ? FOR UPDATE OF d
            """, UUID.class, user, id);
        List<Map<String, Object>> memberships = jdbc.queryForList("""
            SELECT p.id AS provider_id, p.legacy_doctor_id, l.clinic_id
            FROM provider_location_memberships m JOIN providers p ON p.id = m.provider_id
            JOIN practice_locations l ON l.id = m.location_id
            WHERE p.user_id = ? AND m.location_id = ? AND p.active AND m.status = 'active' AND l.active
            FOR UPDATE OF m
            """, user, id);
        if (memberships.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active practice location not found.");
        Map<String, Object> membership = memberships.getFirst();
        List<Map<String, Object>> bookings = jdbc.queryForList("""
            SELECT appointment_date, appointment_time FROM appointments
            WHERE (provider_id = ? OR (provider_id IS NULL AND doctor_id = ?))
                AND (practice_location_id = ? OR (practice_location_id IS NULL AND clinic_id = ?))
                AND status IN ('pending','confirmed','checked_in')
                AND appointment_date + appointment_time > (now() AT TIME ZONE 'Asia/Kolkata')
            """, membership.get("provider_id"), membership.get("legacy_doctor_id"), id, membership.get("clinic_id"));
        for (Map<String, Object> booking : bookings) {
            if (!ScheduleRules.slots(request.schedule(), LocalDate.parse(booking.get("appointment_date").toString()))
                .contains(LocalTime.parse(booking.get("appointment_time").toString())))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Reschedule or cancel affected appointments before changing these hours.");
        }
        String json = mapper.writeValueAsString(request.schedule());
        jdbc.update("""
            UPDATE provider_location_memberships SET schedule = cast(? AS jsonb), updated_at = now()
            WHERE provider_id = ? AND location_id = ?
            """, json, membership.get("provider_id"), id);
        jdbc.update("""
            UPDATE doctors SET schedule = cast(? AS jsonb), updated_at = now() WHERE id = ? AND clinic_id = ?
            """, json, membership.get("legacy_doctor_id"), membership.get("clinic_id"));
        return Map.of("ok", true);
    }

    public record ScheduleRequest(@NotNull Map<String, Object> schedule) {}
}
