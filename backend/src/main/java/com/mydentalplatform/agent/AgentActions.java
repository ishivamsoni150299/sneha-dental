package com.mydentalplatform.agent;

import com.mydentalplatform.clinic.ClinicOnboardingService;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class AgentActions {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ClinicOnboardingService onboarding;
    public AgentActions(JdbcTemplate jdbc, ObjectMapper json, ClinicOnboardingService onboarding) {
        this.jdbc = jdbc; this.json = json; this.onboarding = onboarding;
    }

    @Scheduled(fixedDelay = 3600000, initialDelay = 3600000)
    public void removeExpiredDrafts() {
        jdbc.update("delete from agent_action_drafts where expires_at < now() - interval '1 day'");
        jdbc.update("delete from agent_usage_windows where window_start < ?", System.currentTimeMillis() / 3_600_000 - 24);
    }

    public void use(Jwt actor, String category, int limit) {
        var accepted = jdbc.queryForList("""
            insert into agent_usage_windows(user_id, category, window_start, requests) values (?, ?, ?, 1)
            on conflict (user_id, category, window_start) do update set requests = agent_usage_windows.requests + 1
            where agent_usage_windows.requests < ? returning requests
            """, UUID.fromString(actor.getSubject()), category, System.currentTimeMillis() / 3_600_000, limit);
        if (accepted.isEmpty()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Your assistant usage limit was reached. Please use the page controls for now.");
        jdbc.update("delete from agent_usage_windows where user_id = ? and window_start < ?", UUID.fromString(actor.getSubject()), System.currentTimeMillis() / 3_600_000 - 24);
        jdbc.update("delete from agent_action_drafts where user_id = ? and expires_at < now() - interval '1 day'", UUID.fromString(actor.getSubject()));
    }

    public Map<String, Object> navigate(String page, Jwt actor) {
        String role = actor.getClaimAsString("role");
        String path = switch (page) {
            case "dentists" -> "/dentists";
            case "account" -> "/account";
            case "appointments" -> "patient".equals(role) ? "/appointments" : "/workspace";
            case "settings" -> "clinic-admin".equals(role) ? "/business/clinic/settings" : "/account";
            case "clinic_setup" -> "incomplete-signup".equals(role) ? "/business/signup" : "/workspace";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That page is not available to the assistant.");
        };
        return Map.of("status", "navigate", "message", "Opening the page for you.", "path", path);
    }

    public Map<String, Object> tool(String name, JsonNode args, Jwt actor) {
        return switch (name) {
            case "open_page" -> navigate(args.path("page").asText(), actor);
            case "ask_user" -> Map.of("status", "needs_input", "message", text(args, "message", 600));
            case "prepare_clinic" -> prepare(args, actor);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That action is not supported.");
        };
    }

    @Transactional
    public Map<String, Object> prepare(JsonNode args, Jwt actor) {
        if (!"incomplete-signup".equals(actor.getClaimAsString("role"))) {
            return Map.of("status", "needs_input", "message", "This account cannot create another clinic yet. Clinic creation currently requires a clinic signup account; an existing dentist account keeps its dentist access.");
        }
        String slug = text(args, "slug", 30).toLowerCase(java.util.Locale.ROOT);
        String phone = text(args, "phone", 24);
        if (!slug.matches("[a-z0-9]{3,30}")) return message("Use 3–30 letters or numbers for your clinic's web address.");
        if (!phone.matches("\\+?[0-9 ()-]{7,24}")) return message("Please give me a valid clinic phone number.");
        if (!onboarding.slugAvailable(slug)) return message("That clinic web address is taken. Which other name would you like?");
        var payload = new LinkedHashMap<String, Object>();
        payload.put("name", text(args, "name", 160)); payload.put("phone", phone);
        payload.put("city", text(args, "city", 120)); payload.put("slug", slug);
        payload.put("plan", "trial"); payload.put("billingCycle", "monthly");
        UUID id = UUID.randomUUID();
        jdbc.update("insert into agent_action_drafts(id, user_id, session_family, payload) values (?, ?, ?, cast(? as jsonb))",
            id, UUID.fromString(actor.getSubject()), UUID.fromString(actor.getClaimAsString("sid")), json.writeValueAsString(payload));
        return Map.of("status", "needs_confirmation", "message", "Review your trial clinic. Say 'create this clinic' or press Confirm to save it. No payment will be taken. Publication requires verification.",
            "draftId", id.toString(), "draft", payload);
    }

    @Transactional
    public Map<String, Object> confirm(UUID id, Jwt actor) {
        var rows = jdbc.queryForList("""
            select payload::text, status, result::text from agent_action_drafts
            where id = ? and user_id = ? and session_family = ? and expires_at > now() for update
            """, id, UUID.fromString(actor.getSubject()), UUID.fromString(actor.getClaimAsString("sid")));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "This draft expired or is not yours. Please prepare it again.");
        var row = rows.getFirst();
        if ("completed".equals(row.get("status"))) return readMap((String) row.get("result"));
        if (!"pending".equals(row.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT, "This draft was cancelled. Please prepare it again.");
        if (!"incomplete-signup".equals(actor.getClaimAsString("role"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This account is not eligible for clinic creation.");
        var clinic = onboarding.create(UUID.fromString(actor.getSubject()), actor.getClaimAsString("email"), readMap((String) row.get("payload")));
        var result = Map.<String, Object>of("status", "succeeded", "message", "Your clinic was created. Complete its profile and verification before it appears in search.",
            "clinicId", clinic.get("clinicId"), "path", "/business/clinic/dashboard", "refreshSession", true);
        jdbc.update("update agent_action_drafts set status = 'completed', result = cast(? as jsonb) where id = ?", json.writeValueAsString(result), id);
        return result;
    }

    public void cancel(UUID id, Jwt actor) {
        jdbc.update("update agent_action_drafts set status = 'cancelled' where id = ? and user_id = ? and session_family = ? and status = 'pending'",
            id, UUID.fromString(actor.getSubject()), UUID.fromString(actor.getClaimAsString("sid")));
    }
    private Map<String, Object> message(String text) { return Map.of("status", "needs_input", "message", text); }
    private String text(JsonNode node, String field, int max) {
        String value = node.path(field).asText().strip();
        if (value.isEmpty() || value.length() > max) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please provide a valid " + field + ".");
        return value;
    }
    @SuppressWarnings("unchecked")
    private Map<String, Object> readMap(String value) { return json.readValue(value, Map.class); }
}
