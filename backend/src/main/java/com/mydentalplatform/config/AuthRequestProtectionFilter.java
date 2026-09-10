package com.mydentalplatform.config;

import java.io.IOException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 40)
public class AuthRequestProtectionFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path.startsWith("/api/auth/")) {
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Pragma", "no-cache");
            if (!request.getMethod().equals("GET") && "cross-site".equals(request.getHeader("Sec-Fetch-Site"))) {
                response.sendError(403); return;
            }
            if (request.getContentLengthLong() > 4096) { response.sendError(413); return; }
        }
        chain.doFilter(request, response);
    }
}
