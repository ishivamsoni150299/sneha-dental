package com.mydentalplatform.config;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Reject development authentication settings before accepting production traffic. */
@Component
@Profile("production")
public class ProductionConfiguration {
    public ProductionConfiguration(
        @Value("${platform.auth.test-phone-otp-enabled:false}") boolean testOtp,
        @Value("${platform.auth.secure-cookies:false}") boolean secureCookies,
        @Value("${platform.public-base-url}") String publicUrl,
        @Value("${platform.auth.secret}") String secret) {
        if (testOtp) throw new IllegalStateException("Test phone credentials must be disabled in production.");
        if (!secureCookies) throw new IllegalStateException("Production refresh cookies must be secure.");
        URI url = URI.create(publicUrl);
        if (!"https".equals(url.getScheme()) || url.getHost() == null || url.getUserInfo() != null
            || url.getQuery() != null || url.getFragment() != null) {
            throw new IllegalStateException("PUBLIC_BASE_URL must be an HTTPS URL without credentials, query or fragment.");
        }
        if (secret.equals("bXlkZW50YWxwbGF0Zm9ybS1sb2NhbC1kZXZlbG9wbWVudC1vbmx5LXNlY3JldA==")) {
            throw new IllegalStateException("Set a unique JWT_SECRET for production.");
        }
    }
}
