package com.mydentalplatform.config;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 50)
public class RateLimitingFilter extends OncePerRequestFilter {
    private static final int CLEANUP_INTERVAL = 200;
    private final AtomicInteger requestCounter = new AtomicInteger(0);

    // key -> Bucket
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    private record LimitRule(int maxRequests, long windowSeconds) {}

    private static final Map<String, LimitRule> RULES = Map.of(
        "POST:/api/auth/clinic/login", new LimitRule(10, 60),
        "POST:/api/auth/clinic/signup", new LimitRule(5, 60),
        "POST:/api/auth/professional/signup", new LimitRule(5, 60),
        "POST:/api/auth/professional/login", new LimitRule(10, 60),
        "POST:/api/auth/password-reset/request", new LimitRule(5, 600),
        "POST:/api/public/appointments", new LimitRule(15, 600),
        "POST:/api/public/contacts", new LimitRule(10, 600),
        "PUT:/api/clinics/current/settings", new LimitRule(30, 60),
        "PATCH:/api/clinics/current/appointments", new LimitRule(60, 60)
    );

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String method = request.getMethod().toUpperCase();
        String path = request.getRequestURI();
        String ruleKey = method + ":" + path;

        LimitRule rule = null;
        if (method.equals("POST") && path.matches("/api/(public|clinics/current)/appointments/[^/]+/video/(join|access)")) {
            boolean join = path.endsWith("/join");
            rule = new LimitRule(join ? 12 : 60, join ? 60 : 600);
            ruleKey = join ? "POST:video-join" : "POST:video-access";
        }
        for (Map.Entry<String, LimitRule> entry : RULES.entrySet()) {
            if (rule != null) break;
            if (ruleKey.startsWith(entry.getKey())) {
                rule = entry.getValue();
                ruleKey = entry.getKey();
                break;
            }
        }

        if (rule == null) {
            filterChain.doFilter(request, response);
            return;
        }
        LimitRule appliedRule = rule;

        String clientIp = resolveClientIp(request);
        String bucketKey = ruleKey + ":" + clientIp;

        if (path.startsWith("/api/clinics/current")) {
            String auth = request.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                try {
                    String token = auth.substring(7);
                    String[] parts = token.split("\\.");
                    if (parts.length == 3) {
                        String payload = new String(java.util.Base64.getUrlDecoder().decode(parts[1]));
                        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"clinic_id\"\\s*:\\s*\"([^\"]+)\"").matcher(payload);
                        if (m.find()) {
                            bucketKey = ruleKey + ":" + m.group(1);
                        }
                    }
                } catch (Exception e) {
                    // fall back to IP
                }
            }
        }
        long now = System.currentTimeMillis();

        if (requestCounter.incrementAndGet() % CLEANUP_INTERVAL == 0) {
            cleanupExpiredBuckets(now);
        }

        Bucket bucket = buckets.compute(bucketKey, (k, existing) -> {
            if (existing == null || now - existing.windowStart > appliedRule.windowSeconds * 1000L) {
                return new Bucket(now, 1);
            }
            existing.count++;
            return existing;
        });

        if (bucket.count > appliedRule.maxRequests) {
            long retryAfterSeconds = Math.max(1, appliedRule.windowSeconds - ((now - bucket.windowStart) / 1000L));
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("""
                {
                  "status": 429,
                  "error": "Too Many Requests",
                  "message": "Too many requests. Please slow down and try again later.",
                  "timestamp": "%s"
                }
                """.formatted(Instant.now().toString()));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            String[] parts = xForwardedFor.split(",");
            if (parts.length > 0 && !parts[0].isBlank()) {
                return parts[0].trim();
            }
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown";
    }

    private void cleanupExpiredBuckets(long now) {
        buckets.entrySet().removeIf(entry -> {
            LimitRule rule = RULES.get(entry.getKey().split(":")[0] + ":" + entry.getKey().split(":")[1]);
            long window = (rule != null ? rule.windowSeconds : 600) * 1000L;
            return now - entry.getValue().windowStart > window;
        });
    }

    private static class Bucket {
        final long windowStart;
        int count;

        Bucket(long windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }
}
