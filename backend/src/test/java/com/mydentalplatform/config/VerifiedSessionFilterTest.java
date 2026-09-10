package com.mydentalplatform.config;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class VerifiedSessionFilterTest {
    @AfterEach void cleanup() { SecurityContextHolder.clearContext(); }
    @Test void revokedOrDisabledSessionsCannotReachControllers() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var jwt = Jwt.withTokenValue("test").header("alg", "HS256").subject(UUID.randomUUID().toString())
            .claim("sid", UUID.randomUUID().toString()).claim("role", "patient").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
        when(jdbc.queryForObject(contains("select exists"), eq(Boolean.class), any(Object[].class))).thenReturn(false);
        var response = new MockHttpServletResponse(); var chain = new MockFilterChain();
        new VerifiedSessionFilter(jdbc).doFilter(new MockHttpServletRequest("GET", "/api/patient/session"), response, chain);
        assertEquals(401, response.getStatus()); assertNull(chain.getRequest());
    }
    @Test void passwordLoginIsAllowedAndCrossSiteAuthRequestsAreBlocked() throws Exception {
        var filter = new AuthRequestProtectionFilter();
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("POST", "/api/auth/clinic/login"), response, new MockFilterChain());
        assertEquals(200, response.getStatus());
        var request = new MockHttpServletRequest("POST", "/api/auth/otp/verify"); request.addHeader("Sec-Fetch-Site", "cross-site");
        response = new MockHttpServletResponse(); filter.doFilter(request, response, new MockFilterChain());
        assertEquals(403, response.getStatus());
    }
}
