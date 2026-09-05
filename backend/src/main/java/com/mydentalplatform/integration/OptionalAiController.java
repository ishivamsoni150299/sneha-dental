package com.mydentalplatform.integration;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class OptionalAiController {
    @PostMapping({"/chat", "/voice-session", "/voice-booking-action", "/lead-ai-call"})
    Map<String, Object> unavailablePost() {
        throw unavailable();
    }

    @GetMapping("/openai-voice")
    Map<String, Object> unavailableGet() {
        throw unavailable();
    }

    @PostMapping("/openai-voice")
    Map<String, Object> unavailableVoiceAdmin() {
        throw unavailable();
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "This optional AI provider is not configured on this deployment.");
    }
}