package com.mydentalplatform.config;

import java.util.Base64;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    JwtEncoder jwtEncoder(@Value("${platform.auth.secret}") String encodedSecret) {
        return NimbusJwtEncoder.withSecretKey(secretKey(encodedSecret))
            .algorithm(MacAlgorithm.HS256)
            .build();
    }

    @Bean
    JwtDecoder jwtDecoder(
        @Value("${platform.auth.secret}") String encodedSecret,
        @Value("${platform.auth.issuer}") String issuer
    ) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secretKey(encodedSecret))
            .macAlgorithm(MacAlgorithm.HS256)
            .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.ignoringRequestMatchers("/api/**", "/webhooks/**"))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers("/api/health", "/actuator/health").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/public/**", "/api/marketplace/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/public/contacts").permitAll()
                .requestMatchers("/api/public/appointments/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/public/reviews/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/chat", "/api/voice-session", "/api/voice-booking-action").permitAll()
                .requestMatchers(HttpMethod.GET, "/", "/index.html", "/**/*.js", "/**/*.css", "/assets/**").permitAll()
                .requestMatchers(HttpMethod.GET, SpaRoutingConfig.ROUTES).permitAll()
                .requestMatchers(HttpMethod.GET, "/robots.txt", "/sitemap.xml", "/favicon.ico",
                    "/favicon*.png", "/favicon.svg", "/og-default.svg", "/manifest.webmanifest", "/icons/**").permitAll()
                .requestMatchers(
                    "/api/auth/clinic/login", "/api/auth/clinic/signup",
                    "/api/auth/refresh", "/api/auth/logout", "/api/auth/password-reset/**").permitAll()
                .requestMatchers("/webhooks/**").permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(resourceServer -> resourceServer.jwt(Customizer.withDefaults()))
            .build();
    }

    private SecretKey secretKey(String encodedSecret) {
        byte[] key;
        try {
            key = Base64.getDecoder().decode(encodedSecret);
        } catch (IllegalArgumentException ignored) {
            key = encodedSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }
        if (key.length < 32) {
            throw new IllegalArgumentException("JWT_SECRET must contain at least 32 bytes.");
        }
        return new SecretKeySpec(key, "HmacSHA256");
    }
}
