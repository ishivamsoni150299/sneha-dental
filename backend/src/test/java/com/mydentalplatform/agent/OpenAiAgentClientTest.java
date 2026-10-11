package com.mydentalplatform.agent;

import java.io.ByteArrayInputStream;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class OpenAiAgentClientTest {
    private final HttpClient http = mock(HttpClient.class);
    private final ObjectMapper json = new ObjectMapper();
    @SuppressWarnings("unchecked")
    private <T> HttpResponse<T> response(int status, T body) {
        var response = (HttpResponse<T>) mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status); when(response.body()).thenReturn(body); return response;
    }
    @Test void disabledAgentNeverContactsOpenAi() {
        var client = new OpenAiAgentClient("test-key", false, "test-model", json, http);
        assertFalse(client.configured());
        assertThrows(ResponseStatusException.class, () -> client.route("open appointments"));
        verifyNoInteractions(http); client.shutdown();
    }
    @Test void providerErrorDoesNotLeakItsBodyOrCredential() throws Exception {
        var denied = response(401, "secret provider body");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(denied);
        var client = new OpenAiAgentClient("private-test-key", true, "test-model", json, http);
        var error = assertThrows(ResponseStatusException.class, () -> client.route("hello"));
        assertFalse(error.getMessage().contains("secret")); assertFalse(error.getMessage().contains("private-test-key")); client.shutdown();
    }
    @Test void lowConfidenceDecisionGoesToTheTaskAgent() throws Exception {
        var uncertain = response(200, "{\"answers\":[{\"type\":\"choice\",\"choice\":\"settings\",\"confidence\":0.4}]}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(uncertain);
        var client = new OpenAiAgentClient("test-key", true, "test-model", json, http);
        assertEquals("task", client.route("maybe change something")); client.shutdown();
    }
    @Test void executesOnePendingFunctionAndRequiresCompletedTurn() throws Exception {
        String events = """
            data: {"type":"agent.session.created","session":{"id":"sess_test"}}
            data: {"type":"agent.session.requires_action","session":{"id":"sess_test","required_actions":[{"type":"function_call","turn_id":"turn_test","call_id":"call_test","name":"ask_user","arguments":{"message":"Clinic name?"}}]}}
            data: {"type":"agent.session.turn.completed","turn":{"id":"turn_test","subagent_id":null}}
            """;
        var stream = response(200, new ByteArrayInputStream(events.getBytes(StandardCharsets.UTF_8)));
        var ok = response(200, "{}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(stream, ok, ok, ok);
        var client = new OpenAiAgentClient("test-key", true, "test-model", json, http);
        var count = new AtomicInteger();
        var result = client.run("create clinic", (name, args) -> { count.incrementAndGet(); return Map.of("status", "needs_input", "message", args.path("message").asText()); });
        assertEquals(1, count.get()); assertEquals("Clinic name?", result.get("message")); client.shutdown();
    }
    @Test void droppedStreamCannotClaimSuccess() throws Exception {
        var empty = response(200, new ByteArrayInputStream(new byte[0]));
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(empty);
        var client = new OpenAiAgentClient("test-key", true, "test-model", json, http);
        assertThrows(ResponseStatusException.class, () -> client.run("hello", (name, args) -> Map.of("status", "succeeded"))); client.shutdown();
    }
}
