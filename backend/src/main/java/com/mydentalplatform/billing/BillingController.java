package com.mydentalplatform.billing;

import java.util.Map;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class BillingController {
    private final BillingService billing;
    public BillingController(BillingService billing) { this.billing = billing; }

    @GetMapping("/api/admin/billing/summary")
    Map<String, Object> summary(@AuthenticationPrincipal Jwt jwt) {
        if (jwt == null || !"platform-admin".equals(jwt.getClaimAsString("role")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
        return billing.summary();
    }

    @GetMapping("/api/billing/subscriptions/current")
    Map<String, Object> current(@AuthenticationPrincipal Jwt jwt) { return billing.current(clinicOwner(jwt)); }

    @PostMapping("/api/admin/billing/clinics/{clinicId}/reconcile")
    Map<String, Object> reconcile(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID clinicId,
        @Valid @RequestBody ReconcileRequest request) {
        if (jwt == null || !"platform-admin".equals(jwt.getClaimAsString("role")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform administrator access is required.");
        return billing.reconcile(clinicId, request.subscriptionId());
    }

    @PostMapping("/api/billing/subscriptions/current/refresh")
    Map<String, Object> refresh(@AuthenticationPrincipal Jwt jwt) { return billing.refresh(clinicOwner(jwt)); }

    @PostMapping("/api/billing/subscriptions/{id}/cancel")
    Map<String, Object> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return billing.cancel(clinicOwner(jwt), id);
    }

    @PostMapping({"/api/billing/subscriptions", "/api/create-subscription"})
    Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CheckoutRequest request) {
        if (jwt == null || !("platform-admin".equals(jwt.getClaimAsString("role")) ||
            ("clinic-admin".equals(jwt.getClaimAsString("role")) && request.clinicId().toString().equals(jwt.getClaimAsString("clinic_id")))))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Clinic owner or platform administrator access is required.");
        return billing.create(request.clinicId(), request.plan(), request.billingCycle());
    }

    @PostMapping("/webhooks/razorpay")
    Map<String, Object> webhook(@RequestHeader(name = "x-razorpay-signature", required = false) String signature,
        @RequestHeader(name = "x-razorpay-event-id", required = false) String eventId, @RequestBody String rawBody) {
        return billing.webhook(signature, eventId, rawBody);
    }

    private UUID clinicOwner(Jwt jwt) {
        if (jwt == null || !"clinic-admin".equals(jwt.getClaimAsString("role")) || jwt.getClaimAsString("clinic_id") == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Clinic owner access is required.");
        return UUID.fromString(jwt.getClaimAsString("clinic_id"));
    }

    record CheckoutRequest(@NotNull UUID clinicId, @NotNull @Pattern(regexp = "starter|pro") String plan,
        @NotNull @Pattern(regexp = "monthly|yearly") String billingCycle) { }
    record ReconcileRequest(@NotNull @Pattern(regexp = "sub_[A-Za-z0-9]+") String subscriptionId) { }
}
