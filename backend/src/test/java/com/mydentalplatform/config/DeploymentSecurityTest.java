package com.mydentalplatform.config;

import com.mydentalplatform.admin.PlatformAdminController;
import com.mydentalplatform.auth.UserRole;
import com.mydentalplatform.lead.LeadController;
import com.mydentalplatform.review.ReviewController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.support.TestPropertySourceUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.ObjectMapper;

import static org.mockito.Mockito.mock;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DeploymentSecurityTest {
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        TestPropertySourceUtils.addInlinedPropertiesToEnvironment(context,
            "platform.auth.secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "platform.auth.issuer=http://localhost:8080");
        context.register(TestConfig.class, SecurityConfig.class, SpaRoutingConfig.class,
            PlatformAdminController.class, LeadController.class, ReviewController.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @AfterEach
    void close() { context.close(); }

    @ParameterizedTest
    @ValueSource(strings = {"/appointments", "/platform/login", "/coming-soon", "/admin/login", "/business/clinic/dashboard"})
    void browserDeepLinksLoadAngularWithoutAnAuthorizationHeader(String route) throws Exception {
        mvc.perform(get(route)).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/admin/clinics", "/api/admin/leads", "/api/admin/reviews/moderation"})
    void platformRoleIssuedByLoginCanAccessAdminApis(String route) throws Exception {
        mvc.perform(get(route).with(jwt().jwt(token -> token.claim("role", UserRole.PLATFORM_ADMIN.claimValue()))))
            .andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/admin/clinics", "/api/admin/leads", "/api/admin/reviews/moderation"})
    void clinicUsersCannotAccessPlatformAdminApis(String route) throws Exception {
        mvc.perform(get(route).with(jwt().jwt(token -> token.claim("role", UserRole.CLINIC_ADMIN.claimValue()))))
            .andExpect(status().isForbidden());
        mvc.perform(get(route)).andExpect(status().isUnauthorized());
    }

    @org.junit.jupiter.api.Test
    void renderGeneratedRawJwtSecretStartsSecurityConfiguration() {
        AnnotationConfigWebApplicationContext rawSecretContext = new AnnotationConfigWebApplicationContext();
        rawSecretContext.setServletContext(new MockServletContext());
        TestPropertySourceUtils.addInlinedPropertiesToEnvironment(rawSecretContext,
            "platform.auth.secret=render-generated-secret-with-more-than-32-characters",
            "platform.auth.issuer=https://example.onrender.com");
        rawSecretContext.register(TestConfig.class, SecurityConfig.class, SpaRoutingConfig.class);
        try {
            rawSecretContext.refresh();
        } finally {
            rawSecretContext.close();
        }
    }

    @Configuration
    @EnableWebSecurity
    @EnableWebMvc
    static class TestConfig {
        @Bean JdbcTemplate jdbcTemplate() { return mock(JdbcTemplate.class); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper(); }
    }
}
