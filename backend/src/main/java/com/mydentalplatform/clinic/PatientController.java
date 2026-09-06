package com.mydentalplatform.clinic;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clinics/current/patients")
public class PatientController {
    private final PatientService patientService;

    public PatientController(PatientService patientService) {
        this.patientService = patientService;
    }

    @GetMapping
    public List<PatientService.PatientSummary> listPatients(
        @AuthenticationPrincipal Jwt jwt,
        @RequestParam(required = false) String search,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        return patientService.getPatients(clinicId(jwt), search, limit, offset);
    }

    @GetMapping("/{phone}/appointments")
    public List<Map<String, Object>> patientAppointments(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String phone
    ) {
        return patientService.getPatientAppointments(clinicId(jwt), phone);
    }

    private UUID clinicId(Jwt jwt) {
        String value = jwt.getClaimAsString("clinic_id");
        if (value == null) throw new IllegalArgumentException("Clinic access is required.");
        return UUID.fromString(value);
    }
}
