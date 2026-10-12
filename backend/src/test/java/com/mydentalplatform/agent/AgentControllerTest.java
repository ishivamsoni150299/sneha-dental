package com.mydentalplatform.agent;

import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AgentControllerTest {
    private final OpenAiAgentClient openai = mock(OpenAiAgentClient.class);
    private final AgentActions actions = mock(AgentActions.class);
    private final AgentController controller = new AgentController(openai, actions);
    private final Jwt actor = Jwt.withTokenValue("test").header("alg", "HS256").subject("patient").claim("role", "patient").build();
    private AgentController.Turn correction() {
        return new AgentController.Turn("make it evening", List.of(), null,
            new AgentController.Search("cleaning", "Noida", "", "any"));
    }
    @Test void searchCorrectionsCannotInvokeWriteOrNavigationTools() {
        when(openai.run(anyString(), any())).thenAnswer(call -> {
            BiFunction<String, JsonNode, Map<String, Object>> handler = call.getArgument(1);
            return handler.apply("prepare_clinic", new ObjectMapper().readTree("{}"));
        });
        assertEquals("needs_input", controller.turn(actor, correction()).get("status"));
        verify(actions).use(actor, "turn", 60);
        verifyNoMoreInteractions(actions);
        verify(openai, never()).route(anyString());
    }
    @Test void searchCorrectionsPassExistingPreferencesToTheAgentAndUseValidatedTools() {
        var args = new ObjectMapper().readTree("{\"locality\":\"Noida\",\"period\":\"evening\"}");
        when(actions.tool("find_dentists", args, actor)).thenReturn(Map.of("status", "booking"));
        when(openai.run(anyString(), any())).thenAnswer(call -> {
            String context = call.getArgument(0);
            assertTrue(context.contains("Noida")); assertTrue(context.contains("cleaning"));
            BiFunction<String, JsonNode, Map<String, Object>> handler = call.getArgument(1);
            return handler.apply("find_dentists", args);
        });
        assertEquals("booking", controller.turn(actor, correction()).get("status"));
        verify(actions).tool("find_dentists", args, actor);
    }
}
