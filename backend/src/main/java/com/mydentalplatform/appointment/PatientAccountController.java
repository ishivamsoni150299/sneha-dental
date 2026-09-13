package com.mydentalplatform.appointment;

import java.util.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.mydentalplatform.video.*;

/** Account ownership is checked before using booking details. A phone is not proof of ownership. */
@RestController
@RequestMapping("/api/patient/account")
public class PatientAccountController {
    private final JdbcTemplate jdbc;
    private final AppointmentService appointments;
    private final VideoConsultationService video;
    public PatientAccountController(JdbcTemplate jdbc, AppointmentService appointments, VideoConsultationService video) {
        this.jdbc = jdbc; this.appointments = appointments; this.video = video;
    }
    @GetMapping("/session")
    public Map<String, Object> session(@AuthenticationPrincipal Jwt jwt) {
        UUID user = user(jwt);
        var rows = jdbc.queryForList("select booking_ref, phone_e164 from appointments where patient_id = ? order by appointment_date desc limit 100", user);
        var visits = rows.stream().map(row -> appointments.lookupAny((String)row.get("booking_ref"), (String)row.get("phone_e164"))).toList();
        return Map.of("profile", Map.of("phoneMasked", jwt.getClaimAsString("email") == null ? "Patient account" : jwt.getClaimAsString("email")), "appointments", visits);
    }
    @PostMapping("/lookup")
    public Map<String, Object> lookup(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> request) {
        var rows = jdbc.queryForList("select id from appointments where upper(booking_ref) = upper(?) and patient_id = ?", UUID.class,
            request.getOrDefault("bookingRef", ""), user(jwt));
        if (rows.size() != 1) throw unavailable();
        return summary(owned(jwt, rows.getFirst()));
    }
    @PostMapping("/appointments/{id}/cancel") @Transactional
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        var row = owned(jwt, id);
        appointments.patientCancel(id, (String)row.get("phone_e164"));
        return ResponseEntity.noContent().build();
    }
    @PatchMapping("/appointments/{id}") @Transactional
    public Map<String, Object> update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
        @Valid @RequestBody AppointmentController.PatientUpdateRequest request) {
        var row = owned(jwt, id);
        appointments.patientUpdate(id, new AppointmentController.PatientUpdateRequest((String)row.get("phone_e164"), request.service(), request.date(), request.time(), request.message()));
        return summary(row);
    }
    @PostMapping("/appointments/{id}/video/join")
    public ResponseEntity<DailyVideoClient.Session> join(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        var row = owned(jwt, id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(video.join(id, null, (String)row.get("booking_ref"), (String)row.get("phone_e164")));
    }
    @PostMapping("/appointments/{id}/video/access")
    public ResponseEntity<Void> access(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        var row = owned(jwt, id);
        video.checkAccess(id, null, (String)row.get("booking_ref"), (String)row.get("phone_e164"));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
    private Map<String, Object> summary(Map<String, Object> row) {
        return appointments.lookupAny((String)row.get("booking_ref"), (String)row.get("phone_e164"));
    }
    private Map<String, Object> owned(Jwt jwt, UUID id) {
        var rows = jdbc.queryForList("select booking_ref, phone_e164 from appointments where id = ? and patient_id = ?", id, user(jwt));
        if (rows.size() != 1) throw unavailable();
        return rows.getFirst();
    }
    private UUID user(Jwt jwt) {
        if (jwt == null || !"patient".equals(jwt.getClaimAsString("role"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sign in with your patient account.");
        return UUID.fromString(jwt.getSubject());
    }
    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "This appointment is not linked to your account. For an older guest booking, contact the clinic to verify ownership.");
    }
}
