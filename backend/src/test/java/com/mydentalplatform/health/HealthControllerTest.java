package com.mydentalplatform.health;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class HealthControllerTest {
    private MockMvc mockMvc;
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new HealthController(jdbcTemplate)).build();
    }

    @Test
    void reportsJavaAndPostgreSqlHealth() throws Exception {
        when(jdbcTemplate.queryForObject("select 1", Integer.class)).thenReturn(1);

        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ok"))
            .andExpect(jsonPath("$.service").value("mydentalplatform-java"))
            .andExpect(jsonPath("$.database").value("postgresql"));
    }
}