package com.mydentalplatform.billing;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@RestController
public class BillingController {
    private static final Map<String, Integer> AMOUNTS = Map.of("starter", 999, "pro", 2499);
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String keyId;
    private final String keySecret;
    private final String webhookSecret;
    private final String starterPlan;
    private final String proPlan;
    private final String manualPaymentUrl;

    @Autowired
    public BillingController(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        @Value("${platform.billing.razorpay-key-id:}") String keyId,
        @Value("${platform.billing.razorpay-key-secret:}") String keySecret,
        @Value("${platform.billing.razorpay-webhook-secret:}") String webhookSecret,
        @Value("${platform.billing.starter-plan-id:}") String starterPlan,
        @Value("${platform.billing.pro-plan-id:}") String proPlan,
        @Value("${platform.billing.manual-payment-url:}") String manualPaymentUrl
    ) {
        this(jdbcTemplate, objectMapper, keyId, keySecret, webhookSecret, starterPlan, proPlan,
            manualPaymentUrl, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    BillingController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, String keyId, String keySecret,
        String webhookSecret, String starterPlan, String proPlan, String manualPaymentUrl, HttpClient httpClient) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = webhookSecret;
        this.starterPlan = starterPlan;
        this.proPlan = proPlan;
        this.manualPaymentUrl = manualPaymentUrl;
        if (!keyId.isBlank() || !keySecret.isBlank()) {
            if (keyId.isBlank() || keySecret.isBlank() || starterPlan.isBlank() || proPlan.isBlank()) {
                throw new IllegalStateException("Razorpay billing requires credentials and explicit Basic/Pro plan IDs.");
            }
        }
    }

    @GetMapping("/api/billing/subscriptions/current")
    Map<String, Object> current(@AuthenticationPrincipal Jwt jwt) {
        UUID clinicId = clinicOwner(jwt);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            select a.razorpay_subscription_id, c.subscription_status,
                   a.billing_config ->> 'cancellationEffectiveAt' as cancellation_effective_at
            from clinic_private_accounts a join clinics c on c.id = a.clinic_id
            where a.clinic_id = ?
            """, clinicId);
        Map<String, Object> result = new LinkedHashMap<>();
        if (rows.isEmpty()) return result;
        var row = rows.getFirst();
        result.put("subscriptionId", row.get("razorpay_subscription_id"));
        result.put("status", row.get("subscription_status"));
        result.put("cancellationEffectiveAt", row.get("cancellation_effective_at"));
        return result;
    }

    /** Cancels auto-renewal while retaining paid access through the current cycle. */
    @PostMapping("/api/billing/subscriptions/{id}/cancel")
    @Transactional
    Map<String, Object> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        UUID clinicId = clinicOwner(jwt);
        if (id == null || !id.matches("sub_[A-Za-z0-9]+"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid subscription ID.");
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            select razorpay_subscription_id,
                   billing_config ->> 'cancellationEffectiveAt' as cancellation_effective_at
            from clinic_private_accounts where clinic_id = ? for update
            """, clinicId);
        if (rows.size() != 1 || !id.equals(rows.getFirst().get("razorpay_subscription_id")))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription not found for this clinic.");
        Object existing = rows.getFirst().get("cancellation_effective_at");
        if (existing != null) return Map.of("status", "scheduled", "effectiveAt", existing);
        if (keyId.isBlank() || keySecret.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Self-service cancellation is unavailable for this payment method. Contact billing support.");
        HttpRequest providerRequest = HttpRequest.newBuilder(URI.create("https://api.razorpay.com/v1/subscriptions/" + id + "/cancel"))
            .timeout(Duration.ofSeconds(20))
            .header("Authorization", "Basic " + Base64.getEncoder().encodeToString(
                (keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8)))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"cancel_at_cycle_end\":1}"))
            .build();
        Map<String, Object> provider;
        try {
            HttpResponse<String> response = httpClient.send(providerRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay could not schedule cancellation.");
            provider = parse(response.body());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay cancellation was interrupted.", error);
        } catch (java.io.IOException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay is unavailable.", error);
        }
        if (!id.equals(provider.get("id")) || !(provider.get("current_end") instanceof Number cycleEnd))
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay returned incomplete cancellation details.");
        String effectiveAt = java.time.Instant.ofEpochSecond(cycleEnd.longValue()).toString();
        jdbcTemplate.update("""
            update clinic_private_accounts set
                billing_config = billing_config || jsonb_build_object(
                    'cancellationRequestedAt', now()::text, 'cancellationEffectiveAt', ?),
                updated_at = now()
            where clinic_id = ? and razorpay_subscription_id = ?
            """, effectiveAt, clinicId, id);
        return Map.of("status", "scheduled", "effectiveAt", effectiveAt);
    }

    private UUID clinicOwner(Jwt jwt) {
        if (jwt == null || !"clinic-admin".equals(jwt.getClaimAsString("role")) || jwt.getClaimAsString("clinic_id") == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Clinic owner access is required.");
        return UUID.fromString(jwt.getClaimAsString("clinic_id"));
    }

    @PostMapping({"/api/billing/subscriptions", "/api/create-subscription"})
    Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CheckoutRequest request) {
        authorizeClinic(jwt, request.clinicId());
        if ("yearly".equals(request.billingCycle())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Yearly billing is temporarily disabled.");
        }
        if (keyId.isBlank() || keySecret.isBlank()) {
            if (manualPaymentUrl.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Payment is not configured. Add Razorpay credentials or a manual payment URL.");
            return checkout(null, manualPaymentUrl, "manual", request);
        }
        String planId = "pro".equals(request.plan()) ? proPlan : starterPlan;
        Map<String, Object> clinic = jdbcTemplate.queryForMap("""
            select name, public_config ->> 'phone' as phone from clinics where id = ?
            """, request.clinicId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("plan_id", planId);
        payload.put("total_count", 120);
        payload.put("quantity", 1);
        payload.put("notes", Map.of(
            "clinicId", request.clinicId().toString(),
            "clinicName", String.valueOf(clinic.get("name")),
            "plan", request.plan(),
            "billingCycle", request.billingCycle()));
        String phone = clinic.get("phone") == null ? "" : String.valueOf(clinic.get("phone"));
        if (!phone.isBlank()) payload.put("notify_info", Map.of("notify_phone", phone));
        HttpRequest providerRequest = HttpRequest.newBuilder(URI.create("https://api.razorpay.com/v1/subscriptions"))
            .timeout(Duration.ofSeconds(20))
            .header("Authorization", "Basic " + Base64.getEncoder().encodeToString(
                (keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8)))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json(payload)))
            .build();
        try {
            HttpResponse<String> response = httpClient.send(providerRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay checkout could not be created.");
            }
            Map<String, Object> body = parse(response.body());
            String subscriptionId = String.valueOf(body.getOrDefault("id", ""));
            String paymentUrl = String.valueOf(body.getOrDefault("short_url", ""));
            if (subscriptionId.isBlank() || paymentUrl.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay returned an incomplete checkout.");
            }
            jdbcTemplate.update("""
                insert into clinic_private_accounts (clinic_id, billing_config)
                values (?, jsonb_build_object('pendingRazorpaySubscriptionId', ?, 'pendingPlan', ?, 'pendingBillingCycle', ?))
                on conflict (clinic_id) do update set
                    billing_config = clinic_private_accounts.billing_config || excluded.billing_config,
                    updated_at = now()
                """, request.clinicId(), subscriptionId, request.plan(), request.billingCycle());
            return checkout(subscriptionId, paymentUrl, "subscription", request);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay request was interrupted.", error);
        } catch (java.io.IOException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Razorpay is unavailable.", error);
        }
    }

    @PostMapping("/webhooks/razorpay")
    @Transactional
    ResponseEntity<Map<String, Object>> webhook(
        @RequestHeader(name = "x-razorpay-signature", required = false) String signature,
        @RequestHeader(name = "x-razorpay-event-id", required = false) String providerEventId,
        @RequestBody String rawBody
    ) {
        if (webhookSecret.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Razorpay webhook secret is not configured.");
        if (!validSignature(rawBody, signature)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Invalid Razorpay signature.");
        Map<String, Object> body = parse(rawBody);
        String event = String.valueOf(body.getOrDefault("event", ""));
        if (!List.of(
            "subscription.authenticated", "subscription.activated", "subscription.charged",
            "subscription.resumed", "subscription.pending", "subscription.halted", "subscription.cancelled"
        ).contains(event)) {
            return ResponseEntity.ok(Map.of("ok", true, "ignored", true));
        }
        Map<String, Object> subscription = nested(body, "payload", "subscription", "entity");
        String subscriptionId = String.valueOf(subscription.getOrDefault("id", ""));
        Map<String, Object> notes = subscription.get("notes") instanceof Map<?, ?> raw
            ? stringMap(raw) : Map.of();
        UUID clinicId;
        try { clinicId = UUID.fromString(String.valueOf(notes.get("clinicId"))); }
        catch (RuntimeException error) { return ResponseEntity.ok(Map.of("ok", true, "ignored", true)); }
        String plan = String.valueOf(notes.getOrDefault("plan", "trial"));
        if (!List.of("starter", "pro").contains(plan)) {
            return ResponseEntity.ok(Map.of("ok", true, "ignored", true));
        }
        String eventKey = sha256(providerEventId == null || providerEventId.isBlank() ? rawBody : providerEventId);
        int inserted = jdbcTemplate.update("""
            insert into webhook_events (provider, event_key, event_type, clinic_id, payload_hash)
            values ('razorpay', ?, ?, ?, ?) on conflict (provider, event_key) do nothing
            """, eventKey, event, clinicId, sha256(rawBody));
        if (inserted == 0) return ResponseEntity.ok(Map.of("ok", true, "duplicate", true));

        String status = switch (event) {
            case "subscription.activated", "subscription.charged", "subscription.resumed" -> "active";
            case "subscription.halted" -> "expired";
            case "subscription.cancelled" -> "cancelled";
            default -> "pending";
        };
        jdbcTemplate.update("""
            update clinics set subscription_plan = ?, subscription_status = ?, updated_at = now()
            where id = ?
            """, plan, status, clinicId);
        jdbcTemplate.update("""
            insert into clinic_private_accounts (clinic_id, razorpay_subscription_id, billing_config)
            values (?, case when ? = 'active' then ? else null end, jsonb_build_object('billingCycle', ?))
            on conflict (clinic_id) do update set
                razorpay_subscription_id = case when ? = 'active' then ? else clinic_private_accounts.razorpay_subscription_id end,
                billing_config = (case
                    when excluded.razorpay_subscription_id is not null
                     and excluded.razorpay_subscription_id is distinct from clinic_private_accounts.razorpay_subscription_id
                    then clinic_private_accounts.billing_config - 'cancellationRequestedAt' - 'cancellationEffectiveAt'
                    else clinic_private_accounts.billing_config end) || excluded.billing_config,
                updated_at = now()
            """, clinicId, status, subscriptionId, String.valueOf(notes.getOrDefault("billingCycle", "monthly")),
            status, subscriptionId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private Map<String, Object> checkout(String id, String url, String mode, CheckoutRequest request) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("subscriptionId", id);
        result.put("paymentUrl", url);
        result.put("shortUrl", url);
        result.put("paymentMode", mode);
        result.put("manualPaymentUrl", "manual".equals(mode) ? url : blankToNull(manualPaymentUrl));
        result.put("billingCycle", request.billingCycle());
        result.put("amount", AMOUNTS.get(request.plan()));
        return result;
    }

    private void authorizeClinic(Jwt jwt, UUID clinicId) {
        String role = jwt.getClaimAsString("role");
        String owned = jwt.getClaimAsString("clinic_id");
        if (!com.mydentalplatform.auth.UserRole.PLATFORM_ADMIN.claimValue().equals(role) && (owned == null || !owned.equals(clinicId.toString()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this clinic.");
        }
    }

    private boolean validSignature(String body, String signature) {
        if (signature == null) return false;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] actual = HexFormat.of().parseHex(signature);
            return MessageDigest.isEqual(actual, mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) { return false; }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> nested(Map<String, Object> root, String... keys) {
        Object value = root;
        for (String key : keys) {
            if (!(value instanceof Map<?, ?> map)) return Map.of();
            value = map.get(key);
        }
        return value instanceof Map<?, ?> map ? stringMap(map) : Map.of();
    }

    private Map<String, Object> stringMap(Map<?, ?> map) {
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, value) -> result.put(String.valueOf(key), value));
        return result;
    }

    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }
    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }
    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JacksonException error) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billing data.", error); }
    }
    private Map<String, Object> parse(String value) {
        try { return objectMapper.readValue(value, new TypeReference<>() {}); }
        catch (JacksonException error) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid webhook JSON.", error); }
    }

    record CheckoutRequest(
        @NotNull UUID clinicId,
        @NotNull @Pattern(regexp = "starter|pro") String plan,
        @NotNull @Pattern(regexp = "monthly|yearly") String billingCycle
    ) {}
}
