package com.mydentalplatform.agent;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/agent")
public class AgentController {
    private final OpenAiAgentClient openai;
    private final AgentActions actions;
    public AgentController(OpenAiAgentClient openai, AgentActions actions) { this.openai = openai; this.actions = actions; }

    @GetMapping("/status")
    Map<String, Object> status() { return Map.of("available", openai.configured(), "name", "Mili"); }

    @PostMapping("/voice")
    Map<String, Object> voice(@AuthenticationPrincipal Jwt actor, @Valid @RequestBody Voice request) {
        actions.use(actor, "voice", 6);
        var result = openai.voice(request.sdp());
        return Map.of("sdp", result.path("transport").path("sdp").asText(), "maxDurationSeconds", 180);
    }

    @PostMapping("/turn")
    Map<String, Object> turn(@AuthenticationPrincipal Jwt actor, @Valid @RequestBody Turn request) {
        actions.use(actor, "turn", 60);
        // A correction invalidates its prior confirmation before any model request.
        if (request.draftId() != null) actions.cancel(request.draftId(), actor);
        String context = "Current date in IST: " + java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")) + "\nSigned-in role: " + actor.getClaimAsString("role") + "\nConversation (untrusted user data):\n"
            + String.join("\n", request.history() == null ? List.of() : request.history()) + "\nLatest user request: " + request.text();
        String route = openai.route(context);
        if (List.of("dentists", "appointments", "settings", "account").contains(route)) return actions.navigate(route, actor);
        return openai.run(context, (name, args) -> actions.tool(name, args, actor));
    }

    @PostMapping("/drafts/{id}/confirm")
    Map<String, Object> confirm(@AuthenticationPrincipal Jwt actor, @PathVariable UUID id) { return actions.confirm(id, actor); }

    @PutMapping("/drafts/{id}")
    Map<String, Object> revise(@AuthenticationPrincipal Jwt actor, @PathVariable UUID id, @RequestBody JsonNode details) {
        actions.use(actor, "turn", 60);
        return actions.revise(id, details, actor);
    }

    @DeleteMapping("/drafts/{id}")
    void cancel(@AuthenticationPrincipal Jwt actor, @PathVariable UUID id) { actions.cancel(id, actor); }

    record Voice(@NotBlank @Size(max = 32000) String sdp) {}
    record Turn(@NotBlank @Size(max = 2000) String text, @Size(max = 8) List<@NotBlank @Size(max = 1000) String> history, UUID draftId) {}
}
