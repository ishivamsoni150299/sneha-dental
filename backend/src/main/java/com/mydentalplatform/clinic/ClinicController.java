package com.mydentalplatform.clinic;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
public class ClinicController {
    private final ClinicQueryService clinicQueryService;
    private final ClinicOnboardingService onboardingService;

    public ClinicController(ClinicQueryService clinicQueryService, ClinicOnboardingService onboardingService) {
        this.clinicQueryService = clinicQueryService;
        this.onboardingService = onboardingService;
    }

    @GetMapping("/public/clinics/resolve")
    ResponseEntity<Map<String, Object>> resolve(@RequestParam String host) {
        String normalizedHost = host.trim().toLowerCase();
        if (!normalizedHost.matches("^[a-z0-9.-]{1,253}$")) return ResponseEntity.badRequest().build();
        return clinicQueryService.resolveByHost(normalizedHost)
            .map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/public/clinics/slug-available")
    Map<String, Boolean> slugAvailable(@RequestParam String slug) {
        String normalized = slug.toLowerCase().replaceAll("[^a-z0-9]", "");
        return Map.of("available", !normalized.isBlank() && onboardingService.slugAvailable(normalized));
    }

    @PostMapping("/clinics/onboarding")
    Map<String, Object> onboard(
        @AuthenticationPrincipal Jwt jwt,
        @RequestBody Map<String, Object> request
    ) {
        return onboardingService.create(
            UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email"), request);
    }

    @GetMapping("/clinics/current")
    ResponseEntity<Map<String, Object>> current(@AuthenticationPrincipal Jwt jwt) {
        UUID clinicId = clinicId(jwt);
        return clinicQueryService.findCurrent(clinicId)
            .map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/clinics/current/onboarding")
    ResponseEntity<Void> onboarding(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody OnboardingRequest request
    ) {
        clinicQueryService.markOnboarding(clinicId(jwt), request.field());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/marketplace/clinics")
    List<Map<String, Object>> marketplace(@RequestParam String region) {
        return clinicQueryService.findMarketplace(region.trim());
    }

    @GetMapping("/marketplace/clinics/{slug}")
    ResponseEntity<Map<String, Object>> marketplaceClinic(@PathVariable String slug) {
        if (!slug.matches("^[a-z0-9]+(?:-[a-z0-9]+)*$")) return ResponseEntity.badRequest().build();
        return clinicQueryService.findMarketplaceBySlug(slug)
            .map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/marketplace/clinics/{clinicId}/reviews")
    List<Map<String, Object>> reviews(@PathVariable UUID clinicId) {
        return clinicQueryService.publishedReviews(clinicId);
    }

    private UUID clinicId(Jwt jwt) {
        String value = jwt.getClaimAsString("clinic_id");
        if (value == null) throw new IllegalArgumentException("Clinic access is required.");
        return UUID.fromString(value);
    }

    record OnboardingRequest(
        @Pattern(regexp = "onboardingDismissed|onboardingSharedWebsite") String field
    ) {
    }
}