package com.mydentalplatform.billing;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Owns subscription state and collections; clinic records expose the current entitlement. */
@Service
public class BillingService {
    static final Map<String, Integer> AMOUNTS = Map.of("starter", 999, "pro", 2499);
    private static final List<String> TERMINAL = List.of("cancelled", "completed", "expired", "create_failed");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final HttpClient http;
    private final String keyId, keySecret, webhookSecret, starterPlan, proPlan, manualUrl;

    @Autowired
    public BillingService(JdbcTemplate jdbc, ObjectMapper json, PlatformTransactionManager transactions,
        @Value("${platform.billing.razorpay-key-id:}") String keyId,
        @Value("${platform.billing.razorpay-key-secret:}") String keySecret,
        @Value("${platform.billing.razorpay-webhook-secret:}") String webhookSecret,
        @Value("${platform.billing.starter-plan-id:}") String starterPlan,
        @Value("${platform.billing.pro-plan-id:}") String proPlan,
        @Value("${platform.billing.manual-payment-url:}") String manualUrl) {
        this(jdbc, json, transactions, keyId, keySecret, webhookSecret, starterPlan, proPlan, manualUrl,
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    BillingService(JdbcTemplate jdbc, ObjectMapper json, PlatformTransactionManager transactions,
        String keyId, String keySecret, String webhookSecret, String starterPlan, String proPlan, String manualUrl, HttpClient http) {
        this.jdbc = jdbc; this.json = json; this.tx = new TransactionTemplate(transactions); this.http = http;
        this.keyId = keyId; this.keySecret = keySecret; this.webhookSecret = webhookSecret;
        this.starterPlan = starterPlan; this.proPlan = proPlan; this.manualUrl = manualUrl;
        if ((!keyId.isBlank() || !keySecret.isBlank()) && (keyId.isBlank() || keySecret.isBlank() || webhookSecret.isBlank() || starterPlan.isBlank() || proPlan.isBlank()))
            throw new IllegalStateException("Razorpay requires credentials, webhook secret and monthly Basic/Pro plan IDs.");
        if (!manualUrl.isBlank()) secureUrl(manualUrl);
    }

    public Map<String, Object> current(UUID clinicId) {
        var clinics = jdbc.queryForList("select subscription_plan, subscription_status, public_config ->> 'subscriptionEndDate' as period_end from clinics where id = ?", clinicId);
        if (clinics.isEmpty()) throw problem(HttpStatus.NOT_FOUND, "Clinic not found.");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plan", clinics.getFirst().get("subscription_plan"));
        result.put("status", clinics.getFirst().get("subscription_status"));
        result.put("currentPeriodEnd", clinics.getFirst().get("period_end"));
        var accounts = jdbc.queryForList("select razorpay_subscription_id, billing_config ->> 'cancellationEffectiveAt' as effective_at from clinic_private_accounts where clinic_id = ?", clinicId);
        if (!accounts.isEmpty()) {
            result.put("subscriptionId", accounts.getFirst().get("razorpay_subscription_id"));
            result.put("cancellationEffectiveAt", accounts.getFirst().get("effective_at"));
        }
        var rows = subscriptions(clinicId);
        if (!rows.isEmpty() && (result.get("subscriptionId") != null || !TERMINAL.contains(text(rows.getFirst().get("status"))))) {
            var row = rows.getFirst();
            result.put("providerStatus", row.get("status"));
            result.put("currentPeriodEnd", timestampText(row.get("current_period_end")));
            result.put("subscriptionId", row.get("provider_subscription_id"));
            if (List.of("created", "authenticated", "pending", "halted").contains(text(row.get("status")))) result.put("paymentUrl", row.get("checkout_url"));
        }
        result.put("payments", jdbc.query("""
            select payment_reference, amount_paise, currency, paid_at, provider from billing_payments
            where clinic_id = ? order by paid_at desc limit 50
            """, (rs, n) -> Map.of("reference", rs.getString(1), "amount", rs.getBigDecimal(2).movePointLeft(2),
                "currency", rs.getString(3), "paidAt", rs.getObject(4, OffsetDateTime.class).toString(), "provider", rs.getString(5)), clinicId));
        return result;
    }

    public Map<String, Object> summary() {
        return jdbc.queryForMap("""
            select coalesce(sum(amount_paise), 0) / 100.0 as "collectedTotal",
                coalesce(sum(amount_paise) filter (where paid_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'), 0) / 100.0 as "collectedThisMonth"
            from billing_payments
            """);
    }

    public Map<String, Object> reconcile(UUID clinicId, String subscriptionId) {
        providerId(subscriptionId);
        tx.executeWithoutResult(s -> {
            lockClinic(clinicId);
            var snapshot = provider("GET", "/subscriptions/" + subscriptionId, null);
            var rows = jdbc.queryForList("select * from subscriptions where clinic_id = ? and provider_subscription_id = ?", clinicId, subscriptionId);
            if (rows.isEmpty()) {
                UUID attempt;
                try { attempt = UUID.fromString(text(nested(snapshot, "notes").get("checkoutId"))); }
                catch (RuntimeException e) { throw problem(HttpStatus.CONFLICT, "No matching checkout attempt was found."); }
                rows = jdbc.queryForList("select * from subscriptions where id = ? and clinic_id = ? and status = 'creating' and provider_subscription_id is null", attempt, clinicId);
            }
            if (rows.isEmpty()) throw problem(HttpStatus.CONFLICT, "No matching checkout attempt was found.");
            var row = applySnapshot(rows.getFirst(), snapshot);
            reconcilePayments(row, subscriptionId);
        });
        return current(clinicId);
    }

    public Map<String, Object> refresh(UUID clinicId) {
        tx.executeWithoutResult(s -> {
            lockClinic(clinicId);
            var rows = subscriptions(clinicId);
            if (!rows.isEmpty() && "manual".equals(rows.getFirst().get("provider"))) {
                String status = future(rows.getFirst().get("current_period_end")) ? "active" : "expired";
                jdbc.update("update subscriptions set status = ? where id = ?", status, rows.getFirst().get("id"));
                jdbc.update("update clinics set subscription_status = ?, updated_at = now() where id = ?", status, clinicId);
            }
            if (!rows.isEmpty() && rows.getFirst().get("provider_subscription_id") != null) {
                String id = providerId(text(rows.getFirst().get("provider_subscription_id")));
                var row = applySnapshot(rows.getFirst(), provider("GET", "/subscriptions/" + id, null));
                reconcilePayments(row, id);
            }
        });
        return current(clinicId);
    }

    private void reconcilePayments(Map<String, Object> row, String id) {
        var response = provider("GET", "/invoices?subscription_id=" + id + "&count=100", null);
        if (!(response.get("items") instanceof List<?> items)) throw problem(HttpStatus.BAD_GATEWAY, "Razorpay invoice history is unavailable.");
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> invoice) || !"paid".equals(invoice.get("status")) || !id.equals(invoice.get("subscription_id"))) continue;
            String paymentId = text(invoice.get("payment_id"));
            if (!paymentId.matches("pay_[A-Za-z0-9]+")) continue;
            if (jdbc.queryForObject("select count(*) from billing_payments where provider = 'razorpay' and payment_reference = ?", Integer.class, paymentId) > 0) continue;
            var payment = provider("GET", "/payments/" + paymentId, null);
            if (!paymentId.equals(payment.get("id")) || !Objects.equals(invoice.get("id"), payment.get("invoice_id")))
                throw problem(HttpStatus.BAD_GATEWAY, "Payment does not match its subscription invoice.");
            recordCharge(row, payment);
        }
    }

    /** Platform staff confirm an externally received payment through the existing clinic billing form. */
    public void recordAdminPayment(UUID clinicId, UUID actor, Map<String, Object> request) {
        if (List.of("subscriptionPlan", "subscriptionStatus", "lastPaymentRef", "lastPaymentAmount", "lastPaymentDate", "subscriptionEndDate")
            .stream().noneMatch(request::containsKey)) return;
        lockClinic(clinicId);
        var clinic = jdbc.queryForMap("select subscription_plan, subscription_status from clinics where id = ?", clinicId);
        var subscriptions = subscriptions(clinicId);
        if (subscriptions.stream().anyMatch(row -> "razorpay".equals(row.get("provider")) &&
            (!TERMINAL.contains(text(row.get("status"))) || future(row.get("current_period_end"))))) {
            if ((request.containsKey("subscriptionPlan") && !Objects.equals(request.get("subscriptionPlan"), clinic.get("subscription_plan"))) ||
                (request.containsKey("subscriptionStatus") && !Objects.equals(request.get("subscriptionStatus"), clinic.get("subscription_status"))))
                throw problem(HttpStatus.CONFLICT, "Manage this Razorpay subscription through billing before changing its plan or status.");
            // Provider-managed values cannot be overwritten by stale copies of the clinic edit form.
            List.of("subscriptionEndDate", "billingCycle", "lastPaymentDate", "lastPaymentAmount", "lastPaymentRef", "razorpaySubscriptionId").forEach(request::remove);
            return;
        }
        String plan = text(request.getOrDefault("subscriptionPlan", clinic.get("subscription_plan")));
        String status = text(request.getOrDefault("subscriptionStatus", clinic.get("subscription_status")));
        if (!AMOUNTS.containsKey(plan) || !"active".equals(status)) return;
        String reference = text(request.get("lastPaymentRef")).trim();
        if (reference.isBlank() || reference.length() > 160 || !"monthly".equals(request.getOrDefault("billingCycle", "monthly")))
            throw problem(HttpStatus.BAD_REQUEST, "Verify a monthly payment and enter its unique reference before activating a paid plan.");
        java.math.BigDecimal amount;
        LocalDate paidDate;
        try {
            amount = new java.math.BigDecimal(text(request.get("lastPaymentAmount")));
            paidDate = LocalDate.parse(text(request.get("lastPaymentDate")));
        } catch (RuntimeException e) { throw problem(HttpStatus.BAD_REQUEST, "Enter a valid payment amount and date."); }
        if (amount.compareTo(java.math.BigDecimal.valueOf(AMOUNTS.get(plan))) != 0 || paidDate.isAfter(LocalDate.now(ZoneId.of("Asia/Kolkata"))))
            throw problem(HttpStatus.BAD_REQUEST, "The verified amount must match the monthly plan price and the date cannot be in the future.");
        var existing = jdbc.queryForList("select clinic_id, subscription_id, amount_paise, paid_at from billing_payments where provider = 'manual' and payment_reference = ?", reference);
        OffsetDateTime paidAt = paidDate.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime end = paidAt.plusMonths(1);
        long paise = amount.movePointRight(2).longValueExact();
        if (!existing.isEmpty()) {
            var row = existing.getFirst();
            if (!clinicId.equals(row.get("clinic_id")) || ((Number) row.get("amount_paise")).longValue() != paise ||
                !paidAt.toInstant().equals(((java.sql.Timestamp) row.get("paid_at")).toInstant()))
                throw problem(HttpStatus.CONFLICT, "This payment reference was already recorded with different details.");
            if (!subscriptions.isEmpty() && !Objects.equals(row.get("subscription_id"), subscriptions.getFirst().get("id")))
                throw problem(HttpStatus.CONFLICT, "A newer billing record exists. Refresh the clinic before saving.");
        } else {
            UUID subscriptionId = UUID.randomUUID();
            jdbc.update("""
                insert into subscriptions (id, clinic_id, provider, plan, billing_cycle, status, current_period_start, current_period_end, created_at)
                values (?, ?, 'manual', ?, 'monthly', ?, ?, ?, clock_timestamp())
                """, subscriptionId, clinicId, plan, end.isAfter(OffsetDateTime.now()) ? "active" : "expired", paidAt, end);
            jdbc.update("insert into billing_payments (clinic_id, subscription_id, provider, payment_reference, amount_paise, paid_at, recorded_by) values (?, ?, 'manual', ?, ?, ?, ?)",
                clinicId, subscriptionId, reference, paise, paidAt, actor);
        }
        request.put("subscriptionEndDate", end.toString());
        request.put("lastPaymentRef", reference);
        request.put("subscriptionStatus", end.isAfter(OffsetDateTime.now()) ? "active" : "expired");
        jdbc.update("update clinic_private_accounts set razorpay_subscription_id = null, billing_config = billing_config - 'cancellationEffectiveAt' where clinic_id = ?", clinicId);
    }

    public Map<String, Object> create(UUID clinicId, String plan, String cycle) {
        if (!AMOUNTS.containsKey(plan) || !"monthly".equals(cycle)) throw problem(HttpStatus.BAD_REQUEST, "Choose a monthly Basic or Pro plan. Yearly billing is temporarily disabled.");
        if (keyId.isBlank()) {
            if (manualUrl.isBlank()) throw problem(HttpStatus.SERVICE_UNAVAILABLE, "Checkout is unavailable. Please contact billing support.");
            return tx.execute(s -> {
                lockClinic(clinicId);
                if (subscriptions(clinicId).stream().anyMatch(r -> "manual".equals(r.get("provider"))
                    ? future(r.get("current_period_end")) : !TERMINAL.contains(text(r.get("status")))))
                    throw problem(HttpStatus.CONFLICT, "An existing subscription needs reconciliation before another payment.");
                return checkout(null, manualUrl, "manual", plan);
            });
        }
        // Commit the reservation before calling Razorpay. An ambiguous timeout must not create a second mandate.
        var reservation = tx.execute(s -> {
            lockClinic(clinicId);
            for (var existing : subscriptions(clinicId)) {
                var row = existing;
                if ("manual".equals(row.get("provider")) && !future(row.get("current_period_end"))) {
                    jdbc.update("update subscriptions set status = 'expired' where id = ?", row.get("id"));
                    continue;
                }
                if ("creating".equals(row.get("status"))) throw problem(HttpStatus.CONFLICT, "Checkout creation is awaiting confirmation. Contact billing support before retrying payment.");
                if (!TERMINAL.contains(text(row.get("status"))) || future(row.get("current_period_end"))) {
                    String id = text(row.get("provider_subscription_id"));
                    if (!id.isBlank()) row = applySnapshot(row, provider("GET", "/subscriptions/" + providerId(id), null));
                    String status = text(row.get("status"));
                    if (!TERMINAL.contains(status) || future(row.get("current_period_end"))) {
                        if (plan.equals(row.get("plan")) && List.of("created", "authenticated", "pending", "halted").contains(status) && !text(row.get("checkout_url")).isBlank()) return row;
                        throw problem(HttpStatus.CONFLICT, "This clinic already has a subscription or checkout. Manage it before choosing another plan.");
                    }
                }
            }
            var clinic = jdbc.queryForMap("select subscription_status, public_config ->> 'subscriptionEndDate' as end_date from clinics where id = ?", clinicId);
            if ("active".equals(clinic.get("subscription_status")) && (clinic.get("end_date") == null || future(clinic.get("end_date"))))
                throw problem(HttpStatus.CONFLICT, "Your paid period is still active. Contact billing support to change plans.");
            validatePlan(plan);
            UUID id = UUID.randomUUID();
            jdbc.update("insert into subscriptions (id, clinic_id, plan, billing_cycle, status, provider_plan_id, created_at) values (?, ?, ?, 'monthly', 'creating', ?, clock_timestamp())", id, clinicId, plan, planId(plan));
            return subscription(id);
        });
        if (!"creating".equals(reservation.get("status"))) return checkout(text(reservation.get("provider_subscription_id")), text(reservation.get("checkout_url")), "subscription", plan);
        UUID attempt = (UUID) reservation.get("id");
        Map<String, Object> body;
        try {
            body = provider("POST", "/subscriptions", Map.of("plan_id", planId(plan), "total_count", 120, "quantity", 1,
                "customer_notify", true, "expire_by", Instant.now().plus(Duration.ofDays(7)).getEpochSecond(),
                "notes", Map.of("clinicId", clinicId.toString(), "checkoutId", attempt.toString(), "plan", plan, "billingCycle", "monthly")));
        } catch (ProviderRejected error) {
            tx.executeWithoutResult(s -> jdbc.update("update subscriptions set status = 'create_failed', updated_at = now() where id = ? and status = 'creating'", attempt));
            throw error;
        }
        String id = providerId(text(body.get("id")));
        String url = secureUrl(text(body.get("short_url")));
        tx.executeWithoutResult(s -> {
            lockClinic(clinicId);
            validateIdentity(subscription(attempt), body);
            jdbc.update("""
                update subscriptions set provider_subscription_id = ?, checkout_url = ?,
                status = case when status = 'creating' then 'created' else status end, updated_at = now() where id = ?
                """, id, url, attempt);
        });
        return checkout(id, url, "subscription", plan);
    }

    public Map<String, Object> cancel(UUID clinicId, String id) {
        providerId(id);
        return tx.execute(s -> {
            lockClinic(clinicId);
            var rows = jdbc.queryForList("select * from subscriptions where clinic_id = ? and provider_subscription_id = ?", clinicId, id);
            if (rows.isEmpty()) throw problem(HttpStatus.NOT_FOUND, "Subscription not found for this clinic.");
            var row = rows.getFirst();
            if (!row.get("id").equals(subscriptions(clinicId).getFirst().get("id")))
                throw problem(HttpStatus.CONFLICT, "Only the current subscription can be managed here.");
            var config = jdbc.queryForList("select billing_config ->> 'cancellationEffectiveAt' as effective_at from clinic_private_accounts where clinic_id = ? and razorpay_subscription_id = ?", clinicId, id);
            if (!config.isEmpty() && config.getFirst().get("effective_at") != null) return Map.of("status", "scheduled", "effectiveAt", config.getFirst().get("effective_at"));
            var snapshot = provider("GET", "/subscriptions/" + id, null);
            row = applySnapshot(row, snapshot);
            boolean cycleEnd = "active".equals(row.get("status"));
            if (!TERMINAL.contains(text(row.get("status")))) {
                snapshot = provider("POST", "/subscriptions/" + id + "/cancel", Map.of("cancel_at_cycle_end", cycleEnd ? 1 : 0));
                applySnapshot(row, snapshot);
            }
            String effectiveAt = cycleEnd && snapshot.get("current_end") instanceof Number n ? Instant.ofEpochSecond(n.longValue()).toString() : Instant.now().toString();
            jdbc.update("update clinic_private_accounts set billing_config = billing_config || cast(? as jsonb), updated_at = now() where clinic_id = ?", encode(Map.of("cancellationEffectiveAt", effectiveAt)), clinicId);
            return Map.of("status", cycleEnd ? "scheduled" : "cancelled", "effectiveAt", effectiveAt);
        });
    }

    public Map<String, Object> webhook(String signature, String eventId, String raw) {
        if (webhookSecret.isBlank()) throw problem(HttpStatus.SERVICE_UNAVAILABLE, "Razorpay webhook secret is not configured.");
        if (!validSignature(raw, signature)) throw problem(HttpStatus.BAD_REQUEST, "Invalid Razorpay signature.");
        var body = decode(raw);
        String event = text(body.get("event"));
        if (!List.of("subscription.authenticated", "subscription.activated", "subscription.charged", "subscription.resumed", "subscription.pending", "subscription.halted", "subscription.paused", "subscription.cancelled", "subscription.completed", "subscription.expired").contains(event)) return Map.of("ok", true, "ignored", true);
        var entity = nested(body, "payload", "subscription", "entity");
        String id = providerId(text(entity.get("id")));
        return tx.execute(s -> {
            var rows = jdbc.queryForList("select * from subscriptions where provider_subscription_id = ?", id);
            if (rows.isEmpty()) {
                UUID attempt;
                try { attempt = UUID.fromString(text(nested(entity, "notes").get("checkoutId"))); }
                catch (RuntimeException ex) { return Map.of("ok", true, "ignored", true); }
                rows = jdbc.queryForList("select * from subscriptions where id = ? and status = 'creating' and provider_subscription_id is null", attempt);
            }
            if (rows.isEmpty()) return Map.of("ok", true, "ignored", true);
            UUID localId = (UUID) rows.getFirst().get("id"), clinicId = (UUID) rows.getFirst().get("clinic_id");
            lockClinic(clinicId);
            var row = subscription(localId);
            validateIdentity(row, entity);
            int inserted = jdbc.update("""
                insert into webhook_events (provider, event_key, event_type, clinic_id, payload_hash)
                values ('razorpay', ?, ?, ?, ?) on conflict (provider, event_key) do nothing
                """, hash(eventId == null || eventId.isBlank() ? raw : eventId), event, clinicId, hash(raw));
            if (inserted == 0) return Map.of("ok", true, "duplicate", true);
            // Under the clinic lock, fetch current provider state instead of applying an out-of-order event snapshot.
            applySnapshot(row, provider("GET", "/subscriptions/" + id, null));
            if ("subscription.charged".equals(event)) recordCharge(row, nested(body, "payload", "payment", "entity"));
            return Map.of("ok", true);
        });
    }

    private Map<String, Object> applySnapshot(Map<String, Object> row, Map<String, Object> snapshot) {
        validateIdentity(row, snapshot);
        String id = providerId(text(snapshot.get("id"))), state = text(snapshot.get("status"));
        if (!List.of("created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired").contains(state)) throw problem(HttpStatus.BAD_GATEWAY, "Unknown subscription state.");
        OffsetDateTime start = epoch(snapshot.get("current_start")), end = epoch(snapshot.get("current_end"));
        String url = text(snapshot.get("short_url"));
        if (!url.isBlank()) secureUrl(url);
        UUID localId = (UUID) row.get("id"), clinicId = (UUID) row.get("clinic_id");
        jdbc.update("""
            update subscriptions set provider_subscription_id = ?, provider_plan_id = ?, status = ?, current_period_start = ?,
            current_period_end = ?, checkout_url = coalesce(nullif(?, ''), checkout_url), updated_at = now() where id = ?
            """, id, snapshot.get("plan_id"), state, start, end, url, localId);
        if (localId.equals(subscriptions(clinicId).getFirst().get("id"))) {
            boolean paid = snapshot.get("paid_count") instanceof Number n && n.longValue() > 0;
            boolean access = paid && end != null && end.isAfter(OffsetDateTime.now()) && List.of("active", "pending", "cancelled", "completed").contains(state);
            String status = access ? "active" : switch (state) {
                case "cancelled" -> "cancelled";
                case "halted", "paused", "completed", "expired", "active" -> "expired";
                default -> "pending";
            };
            boolean abandoned = !paid && TERMINAL.contains(state);
            if (abandoned) status = "trial";
            var billing = new LinkedHashMap<String, Object>();
            billing.put("billingCycle", "monthly");
            billing.put("subscriptionEndDate", end == null ? null : end.toString());
            if (List.of("cancelled", "completed").contains(state) && end != null) billing.put("cancellationEffectiveAt", end.toString());
            jdbc.update("update clinics set subscription_plan = ?, subscription_status = ?, public_config = public_config || cast(? as jsonb), updated_at = now() where id = ?",
                abandoned ? "trial" : row.get("plan"), status, encode(Map.of("subscriptionEndDate", end == null ? "" : end.toString())), clinicId);
            jdbc.update("""
                insert into clinic_private_accounts (clinic_id, razorpay_subscription_id, billing_config) values (?, ?, cast(? as jsonb))
                on conflict (clinic_id) do update set razorpay_subscription_id = excluded.razorpay_subscription_id,
                billing_config = (case when clinic_private_accounts.razorpay_subscription_id is distinct from excluded.razorpay_subscription_id
                    then clinic_private_accounts.billing_config - 'cancellationEffectiveAt' else clinic_private_accounts.billing_config end)
                    || excluded.billing_config, updated_at = now()
                """, clinicId, id, encode(billing));
        }
        return subscription(localId);
    }

    private void recordCharge(Map<String, Object> row, Map<String, Object> payment) {
        String ref = text(payment.get("id"));
        if (!ref.matches("pay_[A-Za-z0-9]+") || !"captured".equals(payment.get("status")) || !"INR".equals(payment.get("currency")) || !(payment.get("amount") instanceof Number amount) || amount.longValue() <= 0)
            throw problem(HttpStatus.BAD_REQUEST, "Subscription charge is missing captured payment details.");
        OffsetDateTime paidAt = epoch(payment.get("created_at"));
        if (paidAt == null) throw problem(HttpStatus.BAD_REQUEST, "Payment date is missing.");
        jdbc.update("""
            insert into billing_payments (clinic_id, subscription_id, provider, payment_reference, amount_paise, paid_at)
            values (?, ?, 'razorpay', ?, ?, ?) on conflict (provider, payment_reference) do nothing
            """, row.get("clinic_id"), row.get("id"), ref, amount.longValue(), paidAt);
        var recorded = jdbc.queryForMap("select clinic_id, subscription_id, amount_paise from billing_payments where provider = 'razorpay' and payment_reference = ?", ref);
        if (!Objects.equals(row.get("clinic_id"), recorded.get("clinic_id")) || !Objects.equals(row.get("id"), recorded.get("subscription_id")) ||
            ((Number) recorded.get("amount_paise")).longValue() != amount.longValue())
            throw problem(HttpStatus.CONFLICT, "Payment reference is already associated with a different subscription or amount.");
        jdbc.update("""
            update clinic_private_accounts set billing_config = billing_config || cast(? as jsonb), updated_at = now()
            where clinic_id = ? and (billing_config ->> 'lastPaymentDate' is null or billing_config ->> 'lastPaymentDate' <= ?)
            """, encode(Map.of("lastPaymentDate", paidAt.toString(), "lastPaymentAmount", new java.math.BigDecimal(amount.toString()).movePointLeft(2), "lastPaymentRef", ref)), row.get("clinic_id"), paidAt.toString());
    }

    private void validatePlan(String plan) {
        var p = provider("GET", "/plans/" + planId(plan), null);
        var item = nested(p, "item");
        if (!planId(plan).equals(p.get("id")) || !"monthly".equals(p.get("period")) || !(p.get("interval") instanceof Number i) || i.intValue() != 1 || !"INR".equals(item.get("currency")) || !(item.get("amount") instanceof Number a) || a.longValue() != AMOUNTS.get(plan) * 100L)
            throw problem(HttpStatus.SERVICE_UNAVAILABLE, "The Razorpay plan does not match monthly pricing. Contact billing support.");
    }
    private void validateIdentity(Map<String, Object> row, Map<String, Object> entity) {
        String expected = text(row.get("provider_subscription_id")), plan = text(row.get("provider_plan_id"));
        if (plan.isBlank()) plan = planId(text(row.get("plan")));
        var notes = nested(entity, "notes");
        if ((!expected.isBlank() && !expected.equals(entity.get("id"))) || !plan.equals(entity.get("plan_id")) || !row.get("clinic_id").toString().equals(text(notes.get("clinicId"))) || !row.get("plan").equals(notes.get("plan")) || !"monthly".equals(notes.get("billingCycle")))
            throw problem(HttpStatus.BAD_REQUEST, "Subscription identity does not match the clinic checkout.");
    }
    private Map<String, Object> provider(String method, String path, Map<String, Object> payload) {
        if (keyId.isBlank()) throw problem(HttpStatus.SERVICE_UNAVAILABLE, "Razorpay is unavailable. Contact billing support.");
        var request = HttpRequest.newBuilder(URI.create("https://api.razorpay.com/v1" + path)).timeout(Duration.ofSeconds(20))
            .header("Authorization", "Basic " + Base64.getEncoder().encodeToString((keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8)))
            .header("Content-Type", "application/json").method(method, payload == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(encode(payload))).build();
        try {
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400 && response.statusCode() < 500 && response.statusCode() != 408 && response.statusCode() != 429) throw new ProviderRejected();
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw problem(HttpStatus.BAD_GATEWAY, "Razorpay is unavailable. Check payment status before trying again.");
            return decode(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw problem(HttpStatus.BAD_GATEWAY, "Razorpay request was interrupted. Check payment status before trying again.");
        } catch (java.io.IOException e) { throw problem(HttpStatus.BAD_GATEWAY, "Razorpay could not be reached. Check payment status before trying again."); }
    }
    private void lockClinic(UUID id) {
        if (jdbc.queryForList("select id from clinics where id = ? for update", id).isEmpty()) throw problem(HttpStatus.NOT_FOUND, "Clinic not found.");
    }
    private List<Map<String, Object>> subscriptions(UUID clinic) { return jdbc.queryForList("select * from subscriptions where clinic_id = ? and status != 'create_failed' order by created_at desc, id desc", clinic); }
    private Map<String, Object> subscription(UUID id) { return jdbc.queryForMap("select * from subscriptions where id = ?", id); }
    private String planId(String plan) { return "pro".equals(plan) ? proPlan : starterPlan; }
    private Map<String, Object> checkout(String id, String url, String mode, String plan) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("subscriptionId", id); r.put("paymentUrl", url); r.put("shortUrl", url); r.put("paymentMode", mode);
        r.put("manualPaymentUrl", "manual".equals(mode) ? url : null); r.put("billingCycle", "monthly"); r.put("amount", AMOUNTS.get(plan)); return r;
    }
    private boolean validSignature(String raw, String signature) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return signature != null && MessageDigest.isEqual(HexFormat.of().parseHex(signature), mac.doFinal(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { return false; }
    }
    private String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    private static String providerId(String id) {
        if (id == null || !id.matches("sub_[A-Za-z0-9]+")) throw problem(HttpStatus.BAD_REQUEST, "Invalid subscription ID."); return id;
    }
    private static String secureUrl(String value) {
        try { URI uri = URI.create(value); if ("https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null) return value; }
        catch (IllegalArgumentException ignored) { }
        throw problem(HttpStatus.BAD_GATEWAY, "Invalid checkout link.");
    }
    private static boolean future(Object value) {
        if (value == null) return false;
        try {
            if (value instanceof java.sql.Timestamp t) return t.toInstant().isAfter(Instant.now());
            String s = value.toString(); return (s.length() == 10 ? LocalDate.parse(s).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC) : OffsetDateTime.parse(s).toInstant()).isAfter(Instant.now());
        } catch (RuntimeException e) { return false; }
    }
    private static OffsetDateTime epoch(Object v) { return v instanceof Number n && n.longValue() > 0 ? Instant.ofEpochSecond(n.longValue()).atOffset(ZoneOffset.UTC) : null; }
    private static String text(Object v) { return v == null ? "" : v.toString(); }
    private static String timestampText(Object v) { return v == null ? null : v instanceof java.sql.Timestamp t ? t.toInstant().toString() : v.toString(); }
    private String encode(Object v) { return json.writeValueAsString(v); }
    private Map<String, Object> decode(String v) {
        try { return json.readValue(v, new TypeReference<Map<String, Object>>() {}); }
        catch (RuntimeException e) { throw problem(HttpStatus.BAD_GATEWAY, "Invalid payment provider response."); }
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> nested(Map<String, Object> source, String... keys) {
        Object value = source; for (String key : keys) value = value instanceof Map<?, ?> m ? m.get(key) : null;
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : Map.of();
    }
    private static ResponseStatusException problem(HttpStatus code, String message) { return new ResponseStatusException(code, message); }
    private static class ProviderRejected extends ResponseStatusException {
        ProviderRejected() { super(HttpStatus.BAD_GATEWAY, "Razorpay rejected the request. Contact billing support."); }
    }
}
