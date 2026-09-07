package com.mydentalplatform.config;

import java.io.IOException;
import java.util.UUID;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/** Live authorization: disabled users, changed roles and revoked sessions stop immediately. */
public class VerifiedSessionFilter extends OncePerRequestFilter {
    private final JdbcTemplate jdbc;
    public VerifiedSessionFilter(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken auth) {
            try {
                var jwt = auth.getToken();
                boolean valid = Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from users u join refresh_tokens rt on rt.user_id = u.id
                    where u.id = ? and u.enabled and u.supabase_user_id is not null
                      and replace(u.role::text, '_', '-') = ? and u.clinic_id is not distinct from ?::uuid
                      and rt.family_id = ? and rt.revoked_at is null and least(rt.expires_at, rt.family_expires_at) > now()
                      and ((u.role = 'patient' and u.phone_verified and u.phone_e164 = ?)
                        or (u.role <> 'patient' and u.email_verified and lower(u.email) = lower(?))))
                    """, Boolean.class, UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("role"),
                    jwt.getClaimAsString("clinic_id"), UUID.fromString(jwt.getClaimAsString("sid")),
                    jwt.getClaimAsString("phone"), jwt.getClaimAsString("email")));
                if (!valid) { response.sendError(401); return; }
            } catch (IllegalArgumentException | NullPointerException error) { response.sendError(401); return; }
        }
        chain.doFilter(request, response);
    }
}
