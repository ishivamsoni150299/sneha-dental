package com.mydentalplatform.appointment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AppointmentController {
    private final AppointmentService appointmentService;

    public AppointmentController(AppointmentService appointmentService) {
        this.appointmentService = appointmentService;
    }

    @PostMapping("/public/appointments")
    Map<String, String> book(@Valid @RequestBody BookingRequest request) {
        return Map.of("bookingRef", appointmentService.book(request));
    }

    @GetMapping("/public/appointments/lookup")
    ResponseEntity<Map<String, Object>> lookup(
        @RequestParam UUID clinicId,
        @RequestParam String bookingRef,
        @RequestParam String phone
    ) {
        return ResponseEntity.ofNullable(appointmentService.lookup(clinicId, bookingRef, phone));
    }

    @PostMapping("/public/appointments/lookup-any")
    Map<String, Object> lookupAny(@Valid @RequestBody LookupRequest request) {
        return appointmentService.lookupAny(request.bookingRef(), request.phone());
    }

    @PatchMapping("/public/appointments/{appointmentId}")
    ResponseEntity<Void> update(
        @PathVariable UUID appointmentId,
        @Valid @RequestBody PatientUpdateRequest request
    ) {
        appointmentService.patientUpdate(appointmentId, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/public/appointments/{appointmentId}/cancel")
    ResponseEntity<Void> cancel(
        @PathVariable UUID appointmentId,
        @Valid @RequestBody PhoneRequest request
    ) {
        appointmentService.patientCancel(appointmentId, request.phone());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/clinics/current/appointments")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        return appointmentService.list(clinicId(jwt));
    }

    @PatchMapping("/clinics/current/appointments/{appointmentId}/status")
    ResponseEntity<Void> status(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID appointmentId,
        @Valid @RequestBody StatusRequest request
    ) {
        appointmentService.setStatus(clinicId(jwt), appointmentId, request);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/clinics/current/appointments/{appointmentId}/clinical")
    ResponseEntity<Void> clinical(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable UUID appointmentId,
        @Valid @RequestBody ClinicalRequest request
    ) {
        appointmentService.updateClinical(clinicId(jwt), appointmentId, request);
        return ResponseEntity.noContent().build();
    }

    private UUID clinicId(Jwt jwt) {
        String value = jwt.getClaimAsString("clinic_id");
        if (value == null) throw new IllegalArgumentException("Clinic access is required.");
        return UUID.fromString(value);
    }

    public record BookingRequest(
        @NotNull UUID clinicId,
        @Size(max = 12) String bookingRefPrefix,
        @NotBlank @Size(max = 120) String name,
        @NotBlank @Pattern(regexp = ".*[0-9]{10}.*") String phone,
        @Email @Size(max = 254) String email,
        @NotBlank @Size(max = 160) String service,
        @NotNull LocalDate date,
        @NotNull LocalTime time,
        UUID doctorId,
        @Size(max = 2000) String message,
        @NotBlank @Pattern(regexp = "clinic_website|marketplace") String source,
        OffsetDateTime confirmationDeadline,
        @Size(max = 20) String consentVersion,
        Map<String, Object> attribution
    ) {}

    public record PatientUpdateRequest(
        @NotBlank String phone,
        @Size(max = 160) String service,
        LocalDate date,
        LocalTime time,
        @Size(max = 2000) String message
    ) {}

    public record PhoneRequest(@NotBlank String phone) {}

    public record LookupRequest(
        @NotBlank @Size(max = 32) String bookingRef,
        @NotBlank @Pattern(regexp = ".*[0-9]{10}.*") String phone
    ) {}

    public record StatusRequest(
        @Pattern(regexp = "confirmed|checked_in|completed|no_show|cancelled|declined") String status,
        @Size(max = 500) String cancellationReason
    ) {}

    public record ClinicalRequest(
        String clinicNotes,
        String treatmentDone,
        BigDecimal amountCharged,
        @Pattern(regexp = "paid|unpaid|partial") String paymentStatus,
        @Pattern(regexp = "cash|upi|card|insurance|other") String paymentMethod
    ) {}
}