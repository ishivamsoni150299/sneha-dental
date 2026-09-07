package com.mydentalplatform.video;

import java.util.Map;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class VideoConsultationController {
    private final VideoConsultationService video;
    private final DailyVideoClient daily;
    public VideoConsultationController(VideoConsultationService video, DailyVideoClient daily) {
        this.video = video;
        this.daily = daily;
    }

    @GetMapping("/public/video-consultations/status")
    Map<String, Boolean> status() { return Map.of("available", daily.configured()); }

    @PostMapping("/public/appointments/{id}/video/join")
    ResponseEntity<DailyVideoClient.Session> patient(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PatientAccess access) {
        com.mydentalplatform.auth.PatientIdentity.requirePhone(jwt, access.phone());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(video.join(id, null, access.bookingRef(), access.phone()));
    }

    @PostMapping("/clinics/current/appointments/{id}/video/join")
    ResponseEntity<DailyVideoClient.Session> clinic(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(video.join(id, clinicId(jwt), null, null));
    }

    @GetMapping("/clinics/current/video-settings")
    Map<String, Object> settings(@AuthenticationPrincipal Jwt jwt) { return video.settings(clinicId(jwt)); }

    @PostMapping("/public/appointments/{id}/video/access")
    ResponseEntity<Void> patientAccess(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PatientAccess access) {
        com.mydentalplatform.auth.PatientIdentity.requirePhone(jwt, access.phone());
        video.checkAccess(id, null, access.bookingRef(), access.phone());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/clinics/current/appointments/{id}/video/access")
    ResponseEntity<Void> clinicAccess(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        video.checkAccess(id, clinicId(jwt), null, null);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PutMapping("/clinics/current/video-settings")
    ResponseEntity<Void> settings(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Settings settings) {
        video.saveSettings(clinicId(jwt), settings.enabled(), settings.fee());
        return ResponseEntity.noContent().build();
    }

    private UUID clinicId(Jwt jwt) {
        if (jwt == null || !"clinic-admin".equals(jwt.getClaimAsString("role")) || jwt.getClaimAsString("clinic_id") == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Clinic staff access is required.");
        }
        return UUID.fromString(jwt.getClaimAsString("clinic_id"));
    }

    public record PatientAccess(@NotBlank @Size(max=32) String bookingRef, @NotBlank @Size(max=20) String phone) {}
    public record Settings(boolean enabled, @Min(0) @Max(100000) Integer fee) {}
}
