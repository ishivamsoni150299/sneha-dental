package com.mydentalplatform.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

class GlobalExceptionHandlerTest {
    private MockMvc mockMvc;

    @RestController
    static class TestController {
        @GetMapping("/test/access-denied")
        public void accessDenied() {
            throw new AccessDeniedException("Access denied test");
        }

        @GetMapping("/test/conflict")
        public void conflict() {
            throw new DuplicateKeyException("Duplicate record");
        }

        @GetMapping("/test/bad-request")
        public void badRequest() {
            throw new IllegalArgumentException("Invalid input parameter");
        }

        @GetMapping("/test/param")
        public String requiredParam(@RequestParam("id") String id) {
            return id;
        }

        @PostMapping("/test/json")
        public String jsonBody(@RequestBody Map<String, Object> body) {
            return "ok";
        }

        @GetMapping("/test/unhandled")
        public void unhandled() {
            throw new RuntimeException("Unexpected error");
        }
    }

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void handlesAccessDeniedWithForbiddenStatus() throws Exception {
        mockMvc.perform(get("/test/access-denied"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.status").value(403))
            .andExpect(jsonPath("$.error").value("Forbidden"))
            .andExpect(jsonPath("$.message").value("Access is denied."));
    }

    @Test
    void handlesConflictWithConflictStatus() throws Exception {
        mockMvc.perform(get("/test/conflict"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.status").value(409))
            .andExpect(jsonPath("$.error").value("Conflict"));
    }

    @Test
    void handlesIllegalArgumentWithBadRequest() throws Exception {
        mockMvc.perform(get("/test/bad-request"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.error").value("Bad Request"))
            .andExpect(jsonPath("$.message").value("Invalid input parameter"));
    }

    @Test
    void handlesMalformedJsonWithBadRequest() throws Exception {
        mockMvc.perform(post("/test/json")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{ invalid json"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.error").value("Bad Request"))
            .andExpect(jsonPath("$.message").value("Malformed or unreadable request payload."));
    }

    @Test
    void handlesMissingParamWithBadRequest() throws Exception {
        mockMvc.perform(get("/test/param"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.error").value("Bad Request"));
    }

    @Test
    void handlesUnhandledExceptionsWithInternalServerError() throws Exception {
        mockMvc.perform(get("/test/unhandled"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.status").value(500))
            .andExpect(jsonPath("$.error").value("Internal Server Error"))
            .andExpect(jsonPath("$.message").value("An unexpected error occurred. Please try again."));
    }
}
